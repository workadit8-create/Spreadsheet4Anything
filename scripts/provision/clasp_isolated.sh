#!/usr/bin/env bash
# clasp create/push/deploy di folder isolasi (hindari .clasp.json client 1 di repo root).
# Usage: clasp_provision_isolated <src_dir> "<project title>"
# Prints: SCRIPT_ID|DEPLOY_ID
clasp_provision_isolated() {
  local SRC_DIR="$1"
  local TITLE="$2"
  local WORK DEPLOY_OUT SCRIPT_ID DEPLOY_ID
  WORK="$(mktemp -d "/tmp/clasp-provision.XXXXXX")"
  cp -r "$SRC_DIR/"* "$WORK/"
  DEPLOY_OUT="$(
    cd "$WORK"
    clasp create --type standalone --title "$TITLE"
    clasp push --force
    clasp deploy --description "provision"
  )"
  SCRIPT_ID="$(python3 -c "import json; print(json.load(open('$WORK/.clasp.json'))['scriptId'])")"
  DEPLOY_ID="$(echo "$DEPLOY_OUT" | grep -oE 'AKfycb[^ @]+' | head -1 || true)"
  cp "$WORK/.clasp.json" "$SRC_DIR/.clasp.json"
  rm -rf "$WORK"
  echo "${SCRIPT_ID}|${DEPLOY_ID}"
}
