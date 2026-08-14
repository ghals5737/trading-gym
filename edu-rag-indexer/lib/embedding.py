"""임베딩 백엔드 — local(sentence-transformers) / openai 선택(SPEC 3-4).

무거운 import는 실제로 그 백엔드를 쓸 때만 한다. 검색만 할 때 openai 패키지가
없다고 죽거나, DB 작업만 하는데 torch를 올리는 일이 없도록.
"""

from __future__ import annotations

import os
from typing import List


class Embedder:
    name = ""
    dimension = 0

    def encode(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError


class LocalEmbedder(Embedder):
    """sentence-transformers. 기본 모델은 BAAI/bge-m3(1024차원, 한국어 포함 다국어).

    device 기본값이 cpu인 이유(실측):
      Apple Silicon의 mps 백엔드에서 **짧은 텍스트를 단독으로 인코딩하면 벡터가 깨진다.**
      같은 질의를 단건으로 넣을 때와 긴 문서와 함께 배치로 넣을 때의 벡터 일치도가 0.2372였고
      (cpu에서는 1.0000), 그 결과 질의-문서 유사도가 0.12 대 0.72로 갈렸다. 검색은 항상
      질의 하나만 인코딩하므로 mps를 쓰면 검색이 통째로 망가진다. 속도보다 정확성이 우선이라
      cpu를 기본으로 둔다. 인덱싱만 빠르게 하고 싶으면 config에서 바꿀 수 있게 열어뒀다.
    """

    def __init__(self, model_name: str, dimension: int, batch_size: int = 16, device: str = "cpu"):
        from sentence_transformers import SentenceTransformer

        self.name = "local:%s" % model_name
        self.batch_size = batch_size
        self.model = SentenceTransformer(model_name, device=device or None)

        actual = int(self.model.get_sentence_embedding_dimension())
        if actual != dimension:
            raise ValueError(
                "config.yaml의 차원(%d)과 모델 실제 차원(%d)이 다릅니다 — %s\n"
                "  config를 고치고 재인덱싱하세요(차원이 바뀌면 기존 벡터는 못 씁니다)."
                % (dimension, actual, model_name)
            )
        self.dimension = actual

    def encode(self, texts: List[str]) -> List[List[float]]:
        vectors = self.model.encode(
            texts,
            batch_size=self.batch_size,
            normalize_embeddings=True,  # 코사인 거리를 쓰므로 정규화해서 넣는다
            show_progress_bar=False,
        )
        return [list(map(float, v)) for v in vectors]


class OpenAIEmbedder(Embedder):
    def __init__(self, model_name: str, dimension: int, api_key_env: str, batch_size: int = 64):
        from openai import OpenAI

        api_key = os.environ.get(api_key_env, "").strip()
        if not api_key:
            raise RuntimeError("환경변수 %s가 비어 있습니다 (openai 백엔드)" % api_key_env)

        self.name = "openai:%s" % model_name
        self.model_name = model_name
        self.dimension = dimension
        self.batch_size = batch_size
        self.client = OpenAI(api_key=api_key)

    def encode(self, texts: List[str]) -> List[List[float]]:
        vectors: List[List[float]] = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start:start + self.batch_size]
            response = self.client.embeddings.create(model=self.model_name, input=batch)
            vectors.extend(item.embedding for item in response.data)
        return vectors


def get_embedder(embedding_config: dict) -> Embedder:
    backend = (embedding_config.get("backend") or "local").strip().lower()
    batch_size = int(embedding_config.get("batch_size", 16))

    if backend == "local":
        section = embedding_config["local"]
        return LocalEmbedder(
            section["model"],
            int(section["dimension"]),
            batch_size,
            str(section.get("device", "cpu")),
        )
    if backend == "openai":
        section = embedding_config["openai"]
        return OpenAIEmbedder(
            section["model"],
            int(section["dimension"]),
            section.get("api_key_env", "OPENAI_API_KEY"),
            batch_size,
        )
    raise ValueError("알 수 없는 임베딩 백엔드: %s (local | openai)" % backend)


def configured_dimension(embedding_config: dict) -> int:
    """모델을 올리지 않고 차원만 알아야 할 때(스키마 확인 등)."""
    backend = (embedding_config.get("backend") or "local").strip().lower()
    return int(embedding_config[backend]["dimension"])


def to_pgvector(vector: List[float]) -> str:
    """pgvector 리터럴. psycopg에 문자열로 넘기고 ::vector로 캐스팅한다."""
    return "[" + ",".join("%.7f" % x for x in vector) + "]"
