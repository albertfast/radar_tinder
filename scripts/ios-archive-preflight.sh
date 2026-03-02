#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IOS_DIR="${ROOT_DIR}/ios"
WORKSPACE_PATH="${IOS_DIR}/RadarTinder.xcworkspace"
PROJECT_PATH="${IOS_DIR}/RadarTinder.xcodeproj"
PBXPROJ_PATH="${PROJECT_PATH}/project.pbxproj"
PODFILE_LOCK_PATH="${IOS_DIR}/Podfile.lock"
PODS_MANIFEST_PATH="${IOS_DIR}/Pods/Manifest.lock"

fail() {
  echo "[ERROR] $1" >&2
  exit 1
}

info() {
  echo "[INFO] $1"
}

success() {
  echo "[OK] $1"
}

info "Running iOS archive preflight checks..."
info "Project root: ${ROOT_DIR}"

[[ -d "${IOS_DIR}" ]] || fail "iOS directory not found: ${IOS_DIR}"
[[ -d "${WORKSPACE_PATH}" ]] || fail "Workspace not found: ${WORKSPACE_PATH}"
[[ -d "${PROJECT_PATH}" ]] || fail "Xcode project not found: ${PROJECT_PATH}"
[[ -f "${PBXPROJ_PATH}" ]] || fail "project.pbxproj not found: ${PBXPROJ_PATH}"
[[ -f "${PODFILE_LOCK_PATH}" ]] || fail "Podfile.lock missing. Run 'cd ios && pod install'."
[[ -f "${PODS_MANIFEST_PATH}" ]] || fail "Pods/Manifest.lock missing. Run 'cd ios && pod install'."

if ! diff "${PODFILE_LOCK_PATH}" "${PODS_MANIFEST_PATH}" >/dev/null 2>&1; then
  fail "Pod sandbox is out of sync with Podfile.lock. Run 'cd ios && pod install'."
fi
success "Pods are in sync."

if rg -n "/Users/.*/Downloads/radar_tinder" "${PBXPROJ_PATH}" "${PODFILE_LOCK_PATH}" >/dev/null 2>&1; then
  fail "Detected stale absolute path from another checkout (Downloads/radar_tinder). Reinstall pods in this repo."
fi
success "No stale absolute checkout path detected."

rg -q 'BUNDLE_COMMAND=.*export:embed' "${PBXPROJ_PATH}" || \
  fail "Bundle phase does not use Expo embed bundle command (export:embed)."
rg -q 'export PROJECT_ROOT=.*PROJECT_DIR' "${PBXPROJ_PATH}" || \
  fail "Bundle phase PROJECT_ROOT does not resolve to repo root."
success "Bundle React Native phase looks correct."

[[ -f "${IOS_DIR}/.xcode.env" ]] || fail ".xcode.env missing in ios/"
if ! rg -q 'NODE_BINARY=' "${IOS_DIR}/.xcode.env" "${IOS_DIR}/.xcode.env.local" 2>/dev/null; then
  fail "NODE_BINARY is not configured in ios/.xcode.env(.local)."
fi
success "NODE_BINARY configuration found."

BUILD_SETTINGS_FILE="$(mktemp -t rt-ios-build-settings.XXXXXX)"
trap 'rm -f "${BUILD_SETTINGS_FILE}"' EXIT

if ! xcodebuild \
  -workspace "${WORKSPACE_PATH}" \
  -scheme RadarTinder \
  -configuration Release \
  -showBuildSettings >"${BUILD_SETTINGS_FILE}" 2>/dev/null; then
  fail "xcodebuild -showBuildSettings failed. Ensure Xcode command line tools are installed."
fi

EXPECTED_PROJECT_DIR="${IOS_DIR}"
ACTUAL_PROJECT_DIR="$(rg '^[[:space:]]*PROJECT_DIR = ' "${BUILD_SETTINGS_FILE}" | head -n1 | sed -E 's/^[[:space:]]*PROJECT_DIR = //')"
ACTUAL_SRCROOT="$(rg '^[[:space:]]*SRCROOT = ' "${BUILD_SETTINGS_FILE}" | head -n1 | sed -E 's/^[[:space:]]*SRCROOT = //')"

[[ -n "${ACTUAL_PROJECT_DIR}" ]] || fail "Unable to resolve PROJECT_DIR from xcodebuild settings."
[[ "${ACTUAL_PROJECT_DIR}" == "${EXPECTED_PROJECT_DIR}" ]] || \
  fail "PROJECT_DIR mismatch. Expected '${EXPECTED_PROJECT_DIR}', got '${ACTUAL_PROJECT_DIR}'."
[[ "${ACTUAL_SRCROOT}" == "${EXPECTED_PROJECT_DIR}" ]] || \
  fail "SRCROOT mismatch. Expected '${EXPECTED_PROJECT_DIR}', got '${ACTUAL_SRCROOT}'."

success "Xcode build settings point to current checkout."
success "Preflight passed. Safe to archive from ${WORKSPACE_PATH}"
