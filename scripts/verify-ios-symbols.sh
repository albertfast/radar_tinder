#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"
if [[ -z "${ARCHIVE_PATH}" ]]; then
  echo "Usage: scripts/verify-ios-symbols.sh <path-to-archive.xcarchive>"
  exit 2
fi

APP_DSYMS_DIR="${ARCHIVE_PATH}/dSYMs"
APP_DWARF="${APP_DSYMS_DIR}/RadarTinder.app.dSYM/Contents/Resources/DWARF/RadarTinder"
HERMES_DWARF="${APP_DSYMS_DIR}/hermes.framework.dSYM/Contents/Resources/DWARF/hermes"

if [[ ! -d "${APP_DSYMS_DIR}" ]]; then
  echo "[ERROR] dSYMs folder not found: ${APP_DSYMS_DIR}"
  exit 1
fi

if [[ ! -f "${APP_DWARF}" ]]; then
  echo "[ERROR] App dSYM is missing: ${APP_DWARF}"
  exit 1
fi

echo "[OK] App dSYM found: ${APP_DWARF}"

if [[ -f "${HERMES_DWARF}" ]]; then
  echo "[OK] Hermes dSYM found: ${HERMES_DWARF}"
else
  echo "[WARN] Hermes dSYM is missing. This is non-blocking for release but symbols may be partial."
fi

exit 0
