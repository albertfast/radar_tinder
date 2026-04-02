#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="${ROOT_DIR}/ios"
WORKSPACE_PATH="${IOS_DIR}/RadarTinder.xcworkspace"

info() { echo "[INFO] $*"; }
ok() { echo "[OK] $*"; }

if ! command -v pod >/dev/null 2>&1; then
  echo "[ERROR] CocoaPods is not installed or not on PATH." >&2
  exit 1
fi

info "Cleaning Expo, Metro, Xcode, and native build caches..."
bash "${ROOT_DIR}/scripts/clean-dev-cache.sh"

info "Removing stale CocoaPods artifacts..."
rm -rf "${IOS_DIR}/Pods"
rm -rf "${IOS_DIR}/build"
ok "Removed Pods and ios/build."

info "Reinstalling iOS pods with the current architecture settings..."
(
  cd "${IOS_DIR}"
  pod install
)
ok "Pods installed."

info "Running archive preflight checks..."
bash "${ROOT_DIR}/scripts/ios-archive-preflight.sh"

info "Running Xcode clean for Release/device archive configuration..."
xcodebuild \
  -workspace "${WORKSPACE_PATH}" \
  -scheme RadarTinder \
  -configuration Release \
  -destination "generic/platform=iOS" \
  clean >/dev/null
ok "Release clean complete."

echo "[OK] iOS project is cleaned and ready to archive from ${WORKSPACE_PATH}"
