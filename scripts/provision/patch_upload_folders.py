#!/usr/bin/env python3
"""Isi UPLOAD_FOLDER_ID di sheet SETTING dari provision/drive-layout.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from patch_setting import patch_upload_folder  # noqa: E402

LAYOUT_PATH = ROOT / "provision" / "drive-layout.json"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--client",
        action="append",
        dest="clients",
        help="Slug: demo, client1 (default: semua di drive-layout.json)",
    )
    args = p.parse_args()

    if not LAYOUT_PATH.exists():
        raise SystemExit(f"Layout tidak ditemukan: {LAYOUT_PATH}")

    layout = json.loads(LAYOUT_PATH.read_text())
    entries = layout.get("clients") or {}
    slugs = args.clients or list(entries.keys())

    for slug in slugs:
        entry = entries.get(slug)
        if not entry:
            print(f"Skip {slug}: tidak ada di drive-layout.json")
            continue
        database_id = entry.get("databaseId")
        uploads_id = entry.get("uploadsFolderId")
        if not database_id or not uploads_id:
            print(f"Skip {slug}: databaseId atau uploadsFolderId kosong")
            continue
        label = entry.get("label") or slug
        patch_upload_folder(database_id, uploads_id)
        print(f"✅ {label} ({slug}): UPLOAD_FOLDER_ID = {uploads_id}")


if __name__ == "__main__":
    main()
