#!/usr/bin/env python3
"""Gabung drive-layout.json + client.env → docs/client-registry.json (tanpa secrets)."""
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DRIVE_LAYOUT = ROOT / "provision" / "drive-layout.json"
OUT = ROOT / "docs" / "client-registry.json"

TIER = {
    "dev": "sandbox",
    "demo": "demo",
    "client1": "production",
}

SORT_ORDER = {"dev": 0, "demo": 1, "client1": 2}


def parse_env(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.is_file():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r'([A-Z0-9_]+)="(.*)"\s*$', line)
        if match:
            data[match.group(1)] = match.group(2)
    return data


def git_head() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def spreadsheet_url(spreadsheet_id: str) -> str:
    return f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"


def folder_url(folder_id: str) -> str:
    return f"https://drive.google.com/drive/folders/{folder_id}"


def build_client(slug: str, layout_entry: dict, env: dict[str, str]) -> dict:
    database_id = env.get("DATABASE_ID") or layout_entry.get("databaseId", "")
    backend_engine_id = env.get("BACKEND_ENGINE_ID") or layout_entry.get("backendEngineId", "")
    label = env.get("CLIENT_NAME") or layout_entry.get("label") or slug

    links = {
        "webapp": env.get("WEBAPP_URL", ""),
        "database": spreadsheet_url(database_id) if database_id else "",
        "backend": env.get("BACKEND_WEBAPP_URL", ""),
    }

    extras = {
        "backendEngine": spreadsheet_url(backend_engine_id) if backend_engine_id else "",
        "clientFolder": folder_url(layout_entry["clientFolderId"])
        if layout_entry.get("clientFolderId")
        else "",
        "uploadsFolder": folder_url(layout_entry["uploadsFolderId"])
        if layout_entry.get("uploadsFolderId")
        else "",
    }

    return {
        "slug": slug,
        "label": label,
        "tier": TIER.get(slug, "client"),
        "links": links,
        "extras": extras,
        "ready": bool(links["webapp"] and links["database"] and links["backend"]),
    }


def main() -> None:
    if not DRIVE_LAYOUT.is_file():
        raise SystemExit(f"Tidak ditemukan: {DRIVE_LAYOUT}")

    layout = json.loads(DRIVE_LAYOUT.read_text(encoding="utf-8"))
    clients: dict[str, dict] = {}

    for slug, entry in layout.get("clients", {}).items():
        env_path = ROOT / "clients" / slug / "client.env"
        clients[slug] = build_client(slug, entry, parse_env(env_path))

    clients_root = ROOT / "clients"
    if clients_root.is_dir():
        for env_path in sorted(clients_root.glob("*/client.env")):
            slug = env_path.parent.name
            if slug in clients or slug.startswith("_"):
                continue
            entry = layout.get("clients", {}).get(slug, {})
            clients[slug] = build_client(slug, entry, parse_env(env_path))

    registry = {
        "meta": {
            "title": "Akuntansi Ops Console",
            "syncedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "gitHead": git_head(),
            "rootFolderName": layout.get("rootFolderName", ""),
            "rootFolder": folder_url(layout["rootFolderId"])
            if layout.get("rootFolderId")
            else "",
        },
        "clients": dict(
            sorted(clients.items(), key=lambda item: (SORT_ORDER.get(item[0], 99), item[0]))
        ),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    ready = sum(1 for c in clients.values() if c["ready"])
    print(f"OK → {OUT.relative_to(ROOT)} ({len(clients)} akun, {ready} siap)")


if __name__ == "__main__":
    main()
