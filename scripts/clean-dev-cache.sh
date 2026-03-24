#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="${TMPDIR:-/tmp}"

info() { echo "[INFO] $*"; }
ok() { echo "[OK] $*"; }

info "Cleaning Metro / Expo caches..."
rm -rf "${ROOT_DIR}/.expo" "${ROOT_DIR}/.expo-shared" "${ROOT_DIR}/node_modules/.cache" || true
rm -rf "${TMP_DIR}/metro-"* "${TMP_DIR}/haste-map-"* || true
ok "Metro/Expo caches cleaned."

if command -v watchman >/dev/null 2>&1; then
  info "Resetting watchman subscriptions..."
  watchman watch-del-all >/dev/null 2>&1 || true
  watchman shutdown-server >/dev/null 2>&1 || true
  watchman watch-project "${ROOT_DIR}" >/dev/null 2>&1 || true
  ok "Watchman reset complete."
else
  info "watchman not found, skipping watch reset."
fi

info "Cleaning native build artifacts..."
rm -rf "${ROOT_DIR}/ios/build" "${ROOT_DIR}/android/.gradle" "${ROOT_DIR}/android/app/build" || true
rm -rf "${HOME}/Library/Developer/Xcode/DerivedData/RadarTinder-"* || true
ok "Native build artifacts cleaned."

echo "[OK] Cache cleanup complete."
