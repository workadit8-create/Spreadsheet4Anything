#!/usr/bin/env python3
"""Rapikan spreadsheet ke folder Drive per client (ID file tidak berubah)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from drive_folders import organize_client_files  # noqa: E402

LAYOUT_PATH = ROOT / "provision" / "drive-layout.json"


def read_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^([A-Z_]+)="(.*)"$', line)
        if m:
            out[m.group(1)] = m.group(2)
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"')
    return out


def read_client1_from_config() -> dict[str, str]:
    cfg = ROOT / "Config.js"
    master = ROOT / "provision" / "master.env"
    text = cfg.read_text()
    m = re.search(r'const DATABASE_ID = "([^"]+)"', text)
    database_id = m.group(1) if m else ""
    backend_id = ""
    if master.exists():
        for line in master.read_text().splitlines():
            if line.startswith("MASTER_BACKEND_ENGINE_ID="):
                backend_id = line.split("=", 1)[1].strip()
    return {
        "slug": "client1",
        "DISPLAY_NAME": "Client 1",
        "DATABASE_ID": database_id,
        "BACKEND_ENGINE_ID": backend_id,
    }


def load_clients(slugs: list[str] | None) -> list[dict]:
    clients: list[dict] = []
    instances = ROOT / "provision" / "instances"

    if not slugs or "client1" in slugs:
        c1 = read_client1_from_config()
        if c1.get("DATABASE_ID") and c1.get("BACKEND_ENGINE_ID"):
            clients.append(c1)

    if instances.is_dir():
        for env_file in sorted(instances.glob("*.env")):
            if env_file.name.endswith(".partial.env"):
                continue
            data = read_env(env_file)
            slug = data.get("SLUG") or env_file.stem.replace(".env", "")
            if slugs and slug not in slugs:
                continue
            if slug == "client1":
                continue  # already from Config.js
            if data.get("DATABASE_ID") and data.get("BACKEND_ENGINE_ID"):
                data["slug"] = slug
                clients.append(data)

    return clients


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--client",
        action="append",
        dest="clients",
        help="Slug: demo, client1 (default: semua yang dikenal)",
    )
    args = p.parse_args()

    items = load_clients(args.clients)
    if not items:
        raise SystemExit("Tidak ada client untuk dirapikan.")

    layout: dict = {"clients": {}}
    if LAYOUT_PATH.exists():
        layout = json.loads(LAYOUT_PATH.read_text())

    results = []
    for item in items:
        slug = item["slug"]
        label = item.get("DISPLAY_NAME") or slug
        folder_label = f"{label}" if slug != "client1" else "Client 1"
        print(f"\n==> Rapikan: {folder_label} ({slug})")
        folders = organize_client_files(
            folder_label,
            item["DATABASE_ID"],
            item["BACKEND_ENGINE_ID"],
        )
        entry = {
            "label": folder_label,
            "databaseId": item["DATABASE_ID"],
            "backendEngineId": item["BACKEND_ENGINE_ID"],
            **folders,
        }
        layout.setdefault("clients", {})[slug] = entry
        results.append(entry)
        print(f"    Folder: Akuntansi App / {folder_label}")
        print(f"    Uploads ID: {folders['uploadsFolderId']}")

    layout["rootFolderName"] = "Akuntansi App"
    if results:
        layout["rootFolderId"] = results[0]["rootFolderId"]
    LAYOUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_PATH.write_text(json.dumps(layout, indent=2) + "\n")
    print(f"\n✅ Selesai. Layout: {LAYOUT_PATH}")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
