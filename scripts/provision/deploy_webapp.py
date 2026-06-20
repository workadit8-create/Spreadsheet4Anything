#!/usr/bin/env python3
"""Buat deployment Web App yang benar (clasp deploy saja sering 404)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from google_client import get_credentials  # noqa: E402
from googleapiclient.discovery import build  # noqa: E402


def deploy_webapp(script_id: str, description: str, execute_as: str, access: str) -> dict:
    creds = get_credentials()
    service = build("script", "v1", credentials=creds, cache_discovery=False)

    version = (
        service.projects()
        .versions()
        .create(scriptId=script_id, body={"description": description})
        .execute()
    )
    version_number = version["versionNumber"]

    deployment = (
        service.projects()
        .deployments()
        .create(
            scriptId=script_id,
            body={
                "versionNumber": version_number,
                "description": description,
                "manifestFileName": "appsscript",
                "deploymentConfig": {
                    "webAppConfig": {
                        "access": access,
                        "executeAs": execute_as,
                    }
                },
            },
        )
        .execute()
    )
    deploy_id = deployment["deploymentId"]
    url = f"https://script.google.com/macros/s/{deploy_id}/exec"
    return {
        "scriptId": script_id,
        "versionNumber": version_number,
        "deploymentId": deploy_id,
        "url": url,
        "raw": deployment,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--script-id", required=True)
    p.add_argument("--description", default="web app")
    p.add_argument(
        "--execute-as",
        default="USER_ACCESSING",
        choices=["USER_ACCESSING", "USER_DEPLOYING"],
    )
    p.add_argument(
        "--access",
        default="ANYONE",
        choices=["ANYONE", "ANYONE_ANONYMOUS", "DOMAIN"],
    )
    args = p.parse_args()
    result = deploy_webapp(args.script_id, args.description, args.execute_as, args.access)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
