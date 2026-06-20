#!/usr/bin/env python3
"""Cek UPLOAD_FOLDER_ID di SETTING + isi folder Uploads demo."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from google_client import drive_service, sheets_service  # noqa: E402

LAYOUT = ROOT / "provision" / "drive-layout.json"
DEMO_UPLOADS = "1d8mtCu-af3lto_MialhLyHdXmqGXf4oF"


def read_setting(database_id: str, key: str) -> str:
    svc = sheets_service()
    res = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=database_id, range="SETTING!A:B")
        .execute()
    )
    for row in res.get("values") or []:
        if len(row) >= 2 and str(row[0]).strip() == key:
            return str(row[1]).strip()
    return ""


def list_folder_files(folder_id: str, limit: int = 20) -> list[dict]:
    svc = drive_service()
    res = (
        svc.files()
        .list(
            q=f"'{folder_id}' in parents and trashed = false",
            orderBy="createdTime desc",
            pageSize=limit,
            fields="files(id,name,createdTime,mimeType,webViewLink)",
        )
        .execute()
    )
    return res.get("files") or []


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--client", default="demo", choices=["demo", "client1"])
    args = p.parse_args()

    layout = json.loads(LAYOUT.read_text())
    entry = layout["clients"][args.client]
    database_id = entry["databaseId"]
    expected_uploads = entry["uploadsFolderId"]
    label = entry.get("label") or args.client

    upload_id = read_setting(database_id, "UPLOAD_FOLDER_ID")
    print(f"\n==> {label} ({args.client})")
    print(f"    DATABASE_ID:      {database_id}")
    print(f"    UPLOAD_FOLDER_ID: {upload_id or '(kosong)'}")
    print(f"    Expected Uploads:   {expected_uploads}")

    if upload_id == expected_uploads:
        print("    ✅ SETTING cocok dengan folder Uploads di Drive")
    elif upload_id:
        print("    ⚠️  SETTING tidak sama dengan drive-layout.json")
    else:
        print("    ❌ UPLOAD_FOLDER_ID belum di SETTING")

    folder_id = upload_id or expected_uploads
    files = list_folder_files(folder_id)
    print(f"\n    Isi folder Uploads ({len(files)} file terbaru):")
    if not files:
        print("    (kosong — belum ada upload)")
    else:
        for f in files:
            print(f"    - {f['name']}  ({f.get('createdTime', '')[:19]})")
            print(f"      {f.get('webViewLink', '')}")

    print(f"\n    Buka folder: https://drive.google.com/drive/folders/{folder_id}")


if __name__ == "__main__":
    main()
