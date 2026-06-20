#!/usr/bin/env python3
"""Salin & patch file BACKENDengine untuk instance client baru."""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path


def load_master_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def patch_file(path: Path, replacements: list[tuple[str, str]]) -> None:
    text = path.read_text()
    for old, new in replacements:
        text = text.replace(old, new)
    path.write_text(text)


def patch_api_key(path: Path, new_key: str) -> None:
    text = path.read_text()
    text = re.sub(r"const API_KEY = '[^']*';", f"const API_KEY = '{new_key}';", text)
    path.write_text(text)


def patch_allowed(path: Path, database_id: str) -> None:
    text = path.read_text()
    text = re.sub(
        r"const ALLOWED_SPREADSHEETS = \[\s*'[^']*'\s*\];",
        f"const ALLOWED_SPREADSHEETS = [\n\n  '{database_id}'\n\n];",
        text,
        count=1,
    )
    path.write_text(text)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--slug", required=True)
    p.add_argument("--dest-dir", required=True)
    p.add_argument("--database-id", required=True)
    p.add_argument("--backend-engine-id", required=True)
    p.add_argument("--api-key", required=True)
    p.add_argument("--master-env", required=True)
    p.add_argument("--backend-repo", required=True)
    args = p.parse_args()

    master = load_master_env(Path(args.master_env))
    old_db = master.get("MASTER_DATABASE_ID", "")
    old_be = master.get("MASTER_BACKEND_ENGINE_ID", "")
    if not old_db or not old_be:
        raise SystemExit("MASTER_DATABASE_ID / MASTER_BACKEND_ENGINE_ID kosong di master.env")

    backend_repo = Path(args.backend_repo).resolve()
    dest = Path(args.dest_dir).resolve()
    if dest.exists():
        raise SystemExit(f"Folder backend sudah ada: {dest}")

    dest.mkdir(parents=True)
    replacements = [(old_db, args.database_id), (old_be, args.backend_engine_id)]

    for src in backend_repo.glob("*.js"):
        shutil.copy2(src, dest / src.name)
    shutil.copy2(backend_repo / "appsscript.json", dest / "appsscript.json")
    if (backend_repo / ".claspignore").exists():
        shutil.copy2(backend_repo / ".claspignore", dest / ".claspignore")

    for js in dest.glob("*.js"):
        patch_file(js, replacements)
    patch_api_key(dest / "api.js", args.api_key)
    patch_allowed(dest / "api.js", args.database_id)

    print(str(dest))


if __name__ == "__main__":
    main()
