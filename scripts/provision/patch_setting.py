#!/usr/bin/env python3
"""Isi key BACKEND_* di sheet SETTING spreadsheet database client baru."""

from __future__ import annotations

import argparse

from google_client import sheets_service


def find_setting_rows(spreadsheet_id: str) -> dict[str, int]:
    svc = sheets_service()
    res = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range="SETTING!A:B")
        .execute()
    )
    rows = res.get("values", [])
    out: dict[str, int] = {}
    for i, row in enumerate(rows):
        if not row:
            continue
        key = str(row[0]).strip()
        if key:
            out[key] = i + 1
    return out


def upsert_setting(spreadsheet_id: str, key: str, value: str, row_map: dict[str, int]) -> None:
    svc = sheets_service()
    if key in row_map:
        rng = f"SETTING!B{row_map[key]}"
        svc.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=rng,
            valueInputOption="RAW",
            body={"values": [[value]]},
        ).execute()
    else:
        svc.spreadsheets().values().append(
            spreadsheetId=spreadsheet_id,
            range="SETTING!A:B",
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": [[key, value]]},
        ).execute()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--database-id", required=True)
    p.add_argument("--backend-engine-id", required=True)
    p.add_argument("--backend-url", required=True)
    p.add_argument("--api-key", required=True)
    args = p.parse_args()

    row_map = find_setting_rows(args.database_id)
    upsert_setting(args.database_id, "BACKEND_ENGINE_ID", args.backend_engine_id, row_map)
    row_map = find_setting_rows(args.database_id)
    upsert_setting(args.database_id, "BACKEND_WEBAPP_URL", args.backend_url, row_map)
    row_map = find_setting_rows(args.database_id)
    upsert_setting(args.database_id, "BACKEND_API_KEY", args.api_key, row_map)
    print("SETTING updated: BACKEND_ENGINE_ID, BACKEND_WEBAPP_URL, BACKEND_API_KEY")


if __name__ == "__main__":
    main()
