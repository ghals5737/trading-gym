"""문서 메타데이터 로딩.

지금 소스는 수기로 쓴 sources.csv 하나지만, Open API 승인 뒤에는 수집기가 만드는
catalog.jsonl이 같은 스키마로 합류한다(SPEC 2.2). 그래서 "소스별 로더 함수 +
merge_sources"로 갈라놨고, 소스가 늘어도 loader를 하나 더 쓰고 merge에 넣기만 하면 된다.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

REQUIRED_COLUMNS = ["filename", "org_name", "topic_tags", "target", "year", "license", "source_url", "title"]


@dataclass
class SourceMeta:
    filename: str  # data/raw/ 기준 상대경로 — 매칭 키
    title: str = ""
    org_name: str = ""
    topic_tags: List[str] = field(default_factory=list)
    target: str = ""
    year: str = ""
    license: str = ""
    source_url: str = ""
    origin: str = ""  # 어느 소스에서 왔는지 (sources.csv / catalog.jsonl)


def _split_tags(value: str) -> List[str]:
    return [tag.strip() for tag in (value or "").split(";") if tag.strip()]


def load_from_csv(path: Path) -> Dict[str, SourceMeta]:
    """수기 작성 sources.csv. 헤더·값의 앞뒤 공백은 흘려보낸다."""
    if not path.exists():
        raise FileNotFoundError(
            "메타데이터 파일이 없습니다: %s\n"
            "  컬럼: %s" % (path, ", ".join(REQUIRED_COLUMNS))
        )

    entries: Dict[str, SourceMeta] = {}
    with open(path, encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, skipinitialspace=True)
        headers = [(h or "").strip() for h in (reader.fieldnames or [])]
        missing = [c for c in REQUIRED_COLUMNS if c not in headers]
        if missing:
            raise ValueError("sources.csv에 없는 컬럼: %s" % ", ".join(missing))

        for row in reader:
            clean = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
            filename = clean.get("filename", "")
            if not filename or filename.startswith("#"):
                continue
            entries[filename] = SourceMeta(
                filename=filename,
                title=clean.get("title", ""),
                org_name=clean.get("org_name", ""),
                topic_tags=_split_tags(clean.get("topic_tags", "")),
                target=clean.get("target", ""),
                year=clean.get("year", ""),
                license=clean.get("license", ""),
                source_url=clean.get("source_url", ""),
                origin="sources.csv",
            )
    return entries


def load_from_catalog_jsonl(path: Path) -> Dict[str, SourceMeta]:
    """edu-content-collector가 만드는 catalog.jsonl을 같은 스키마로 흡수한다.

    아직 API 승인 전이라 실사용은 안 하지만, 필드 대응은 미리 맞춰둔다.
    (local_path → filename, topic_name → topic_tags, org_name/target/year/license 동일)
    """
    entries: Dict[str, SourceMeta] = {}
    if not path.exists():
        return entries

    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            local_path = (row.get("local_path") or "").strip()
            if not local_path or row.get("status") not in ("DOWNLOADED", "SKIPPED_EXISTS"):
                continue
            # catalog의 local_path는 수집기 기준 경로다. raw/ 이하만 잘라 매칭 키로 쓴다.
            filename = local_path.split("/raw/", 1)[-1]
            entries[filename] = SourceMeta(
                filename=filename,
                title=row.get("title", ""),
                org_name=row.get("org_name", ""),
                topic_tags=[t for t in [row.get("topic_name", "")] if t],
                target=row.get("target", ""),
                year=row.get("year", ""),
                license=row.get("license", ""),
                source_url=row.get("external_url") or row.get("file_url", ""),
                origin="catalog.jsonl",
            )
    return entries


def merge_sources(*sources: Dict[str, SourceMeta]) -> Dict[str, SourceMeta]:
    """앞쪽 소스가 우선(수기 CSV가 자동 수집분을 덮어쓴다)."""
    merged: Dict[str, SourceMeta] = {}
    for source in reversed(sources):
        merged.update(source)
    return merged


def load_sources(settings) -> Dict[str, SourceMeta]:
    """소스를 늘릴 때 손대는 유일한 지점."""
    csv_entries = load_from_csv(settings.sources_csv)
    catalog_entries = load_from_catalog_jsonl(settings.data_dir / "catalog.jsonl")
    return merge_sources(csv_entries, catalog_entries)
