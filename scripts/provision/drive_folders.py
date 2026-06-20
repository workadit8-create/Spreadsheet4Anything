"""Google Drive — folder Akuntansi App per client."""

from __future__ import annotations

from google_client import drive_service

FOLDER_MIME = "application/vnd.google-apps.folder"
ROOT_NAME = "Akuntansi App"


def _escape_q(value: str) -> str:
    return value.replace("'", "\\'")


def find_folder(name: str, parent_id: str | None = None) -> str | None:
    svc = drive_service()
    q = (
        f"name = '{_escape_q(name)}' and mimeType = '{FOLDER_MIME}' "
        "and trashed = false"
    )
    if parent_id:
        q += f" and '{parent_id}' in parents"
    res = (
        svc.files()
        .list(q=q, spaces="drive", fields="files(id,name)", pageSize=10)
        .execute()
    )
    files = res.get("files", [])
    return files[0]["id"] if files else None


def create_folder(name: str, parent_id: str | None = None) -> str:
    svc = drive_service()
    meta: dict = {"name": name, "mimeType": FOLDER_MIME}
    if parent_id:
        meta["parents"] = [parent_id]
    res = svc.files().create(body=meta, fields="id").execute()
    return res["id"]


def find_or_create_folder(name: str, parent_id: str | None = None) -> str:
    existing = find_folder(name, parent_id)
    if existing:
        return existing
    return create_folder(name, parent_id)


def get_or_create_root() -> str:
    return find_or_create_folder(ROOT_NAME, None)


def ensure_client_tree(client_label: str) -> dict[str, str]:
    """Buat Akuntansi App / {client_label} / Uploads. Return folder ids."""
    root_id = get_or_create_root()
    client_id = find_or_create_folder(client_label, root_id)
    uploads_id = find_or_create_folder("Uploads", client_id)
    return {
        "rootFolderId": root_id,
        "clientFolderId": client_id,
        "uploadsFolderId": uploads_id,
    }


def move_into_folder(file_id: str, folder_id: str) -> None:
    svc = drive_service()
    meta = svc.files().get(fileId=file_id, fields="parents").execute()
    parents = meta.get("parents") or []
    if folder_id in parents:
        return
    remove = ",".join(parents) if parents else None
    kwargs: dict = {"fileId": file_id, "addParents": folder_id, "fields": "id,parents"}
    if remove:
        kwargs["removeParents"] = remove
    svc.files().update(**kwargs).execute()


def organize_client_files(
    client_label: str,
    database_id: str,
    backend_id: str,
) -> dict:
    folders = ensure_client_tree(client_label)
    move_into_folder(database_id, folders["clientFolderId"])
    move_into_folder(backend_id, folders["clientFolderId"])
    return folders
