#!/usr/bin/env python3
"""Salin spreadsheet database + backend engine via Drive API."""

from __future__ import annotations

import argparse
import json
import sys

from google_client import drive_service


def copy_file(file_id: str, name: str) -> str:
    svc = drive_service()
    meta = {"name": name}
    res = svc.files().copy(fileId=file_id, body=meta, supportsAllDrives=True).execute()
    return res["id"]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--database-id", required=True)
    p.add_argument("--backend-id", required=True)
    p.add_argument("--name", required=True, help="Nama tampilan client, mis. Demo Akuntansi")
    args = p.parse_args()

    db_name = f"DB — {args.name}"
    be_name = f"Backend Engine — {args.name}"

    new_db = copy_file(args.database_id, db_name)
    new_be = copy_file(args.backend_id, be_name)

    out = {
        "databaseId": new_db,
        "backendEngineId": new_be,
        "databaseName": db_name,
        "backendName": be_name,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
