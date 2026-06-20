"""OAuth + Google API clients untuk provision Level 3."""

from __future__ import annotations

import json
import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.projects",
]

ROOT = Path(__file__).resolve().parents[2]
PROVISION_DIR = ROOT / "provision"
TOKEN_PATH = PROVISION_DIR / "token.json"
OAUTH_CLIENT_PATH = PROVISION_DIR / "oauth-client.json"


def get_credentials() -> Credentials:
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_PATH.write_text(creds.to_json())
        return creds
    if creds and creds.valid:
        return creds
    if not OAUTH_CLIENT_PATH.exists():
        raise SystemExit(
            "Belum ada provision/oauth-client.json\n"
            "Jalankan: ./scripts/provision/setup-auth.sh"
        )
    flow = InstalledAppFlow.from_client_secrets_file(str(OAUTH_CLIENT_PATH), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKEN_PATH.write_text(creds.to_json())
    return creds


def drive_service():
    return build("drive", "v3", credentials=get_credentials(), cache_discovery=False)


def sheets_service():
    return build("sheets", "v4", credentials=get_credentials(), cache_discovery=False)
