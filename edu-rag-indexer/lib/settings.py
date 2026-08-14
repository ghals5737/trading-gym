"""config.yaml 로더."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import yaml

PROJECT_DIR = Path(__file__).resolve().parent.parent


class Settings:
    def __init__(self, raw: Dict[str, Any]):
        self.raw = raw

    # --- 경로 ---

    @property
    def data_dir(self) -> Path:
        return (PROJECT_DIR / self.raw["paths"]["data_dir"]).resolve()

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / self.raw["paths"]["raw_subdir"]

    @property
    def sources_csv(self) -> Path:
        return self.data_dir / self.raw["paths"]["sources_csv"]

    # --- 섹션 ---

    @property
    def parsing(self) -> Dict[str, Any]:
        return self.raw["parsing"]

    @property
    def chunking(self) -> Dict[str, Any]:
        return self.raw["chunking"]

    @property
    def embedding(self) -> Dict[str, Any]:
        return self.raw["embedding"]

    # --- DB ---

    @property
    def database_url(self) -> str:
        section = self.raw["database"]
        return os.environ.get(section["url_env"], "").strip() or section["default_url"]


def load_settings(path: Path = None) -> Settings:
    config_path = Path(path) if path else PROJECT_DIR / "config.yaml"
    with open(config_path, encoding="utf-8") as handle:
        return Settings(yaml.safe_load(handle))
