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

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

normalize_pbxproj_shell_scripts() {
  local pbxproj_path="$1"
  local result

  result="$(python3 - "$pbxproj_path" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
lines = text.splitlines(keepends=True)

def decode_pbx_quoted(value: str) -> str:
  out = []
  i = 0
  while i < len(value):
    ch = value[i]
    if ch == '\\' and i + 1 < len(value):
      nxt = value[i + 1]
      if nxt in ['\\', '"']:
        out.append(nxt)
      elif nxt == 'n':
        out.append('\n')
      elif nxt == 'r':
        out.append('\r')
      elif nxt == 't':
        out.append('\t')
      else:
        out.append('\\')
        out.append(nxt)
      i += 2
      continue
    out.append(ch)
    i += 1
  return ''.join(out)

def encode_pbx_simple_string(value: str) -> str:
  return value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

out = []
i = 0
changes = 0
version_changes = 0

while i < len(lines):
  line = lines[i]
  match = re.match(r'^(\s*)shellScript = \(\s*$', line)
  if not match:
    out.append(line)
    i += 1
    continue

  indent = match.group(1)
  original_start = i
  i += 1
  script_lines = []
  valid_block = True

  while i < len(lines):
    current = lines[i]
    if re.match(r'^\s*\);\s*$', current):
      break

    item_match = re.match(r'^\s*"((?:\\.|[^"\\])*)",\s*$', current.rstrip('\n'))
    if not item_match:
      valid_block = False
      break

    script_lines.append(decode_pbx_quoted(item_match.group(1)))
    i += 1

  if not valid_block or i >= len(lines):
    out.extend(lines[original_start:i + 1 if i < len(lines) else i])
    if i < len(lines):
      i += 1
    continue

  encoded = encode_pbx_simple_string('\n'.join(script_lines))
  out.append(f'{indent}shellScript = "{encoded}";\n')
  changes += 1

  i += 1

final_text = ''.join(out)

def clamp_version(match: re.Match) -> str:
    global version_changes
    key = match.group(1)
    value = int(match.group(2))
    if value > 77:
        version_changes += 1
        return f'{key} = 77;'
    return match.group(0)

final_text = re.sub(r'\b(objectVersion)\s*=\s*(\d+);', clamp_version, final_text)
final_text = re.sub(r'\b(preferredProjectObjectVersion)\s*=\s*(\d+);', clamp_version, final_text)

if changes > 0 or version_changes > 0:
    path.write_text(final_text, encoding='utf-8')

print(f"{changes}:{version_changes}")
PY
)"

  if [[ "$result" =~ ^[0-9]+:[0-9]+$ ]]; then
    local shell_changes="${result%%:*}"
    local version_changes="${result##*:}"

    if [[ "$shell_changes" -gt 0 ]]; then
      info "Normalized ${shell_changes} malformed shellScript build phases in project.pbxproj."
    fi
    if [[ "$version_changes" -gt 0 ]]; then
      info "Downgraded Xcode project object version to 77 for CocoaPods compatibility."
    fi
  fi
}

match_any() {
  local pattern="$1"
  shift
  if has_cmd rg; then
    rg -q "$pattern" "$@"
  else
    grep -Eq "$pattern" "$@"
  fi
}

extract_setting_line() {
  local pattern="$1"
  local file="$2"
  if has_cmd rg; then
    rg "$pattern" "$file" | head -n1
  else
    grep -E "$pattern" "$file" | head -n1
  fi
}

info "Running iOS archive preflight checks..."
info "Project root: ${ROOT_DIR}"

[[ -d "${IOS_DIR}" ]] || fail "iOS directory not found: ${IOS_DIR}"
[[ -d "${WORKSPACE_PATH}" ]] || fail "Workspace not found: ${WORKSPACE_PATH}"
[[ -d "${PROJECT_PATH}" ]] || fail "Xcode project not found: ${PROJECT_PATH}"
[[ -f "${PBXPROJ_PATH}" ]] || fail "project.pbxproj not found: ${PBXPROJ_PATH}"
[[ -f "${PODFILE_LOCK_PATH}" ]] || fail "Podfile.lock missing. Run 'cd ios && pod install'."
[[ -f "${PODS_MANIFEST_PATH}" ]] || fail "Pods/Manifest.lock missing. Run 'cd ios && pod install'."

normalize_pbxproj_shell_scripts "${PBXPROJ_PATH}"

if ! diff "${PODFILE_LOCK_PATH}" "${PODS_MANIFEST_PATH}" >/dev/null 2>&1; then
  fail "Pod sandbox is out of sync with Podfile.lock. Run 'cd ios && pod install'."
fi
success "Pods are in sync."

if match_any "/Users/.*/Downloads/radar_tinder" "${PBXPROJ_PATH}" "${PODFILE_LOCK_PATH}"; then
  fail "Detected stale absolute path from another checkout (Downloads/radar_tinder). Reinstall pods in this repo."
fi
success "No stale absolute checkout path detected."

match_any 'BUNDLE_COMMAND=.*export:embed' "${PBXPROJ_PATH}" || \
  fail "Bundle phase does not use Expo embed bundle command (export:embed)."
match_any 'export PROJECT_ROOT=.*PROJECT_DIR' "${PBXPROJ_PATH}" || \
  fail "Bundle phase PROJECT_ROOT does not resolve to repo root."
success "Bundle React Native phase looks correct."

[[ -f "${IOS_DIR}/.xcode.env" ]] || fail ".xcode.env missing in ios/"
if ! match_any 'NODE_BINARY=' "${IOS_DIR}/.xcode.env" "${IOS_DIR}/.xcode.env.local" 2>/dev/null; then
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
ACTUAL_PROJECT_DIR="$(extract_setting_line '^[[:space:]]*PROJECT_DIR = ' "${BUILD_SETTINGS_FILE}" | sed -E 's/^[[:space:]]*PROJECT_DIR = //')"
ACTUAL_SRCROOT="$(extract_setting_line '^[[:space:]]*SRCROOT = ' "${BUILD_SETTINGS_FILE}" | sed -E 's/^[[:space:]]*SRCROOT = //')"

[[ -n "${ACTUAL_PROJECT_DIR}" ]] || fail "Unable to resolve PROJECT_DIR from xcodebuild settings."
[[ "${ACTUAL_PROJECT_DIR}" == "${EXPECTED_PROJECT_DIR}" ]] || \
  fail "PROJECT_DIR mismatch. Expected '${EXPECTED_PROJECT_DIR}', got '${ACTUAL_PROJECT_DIR}'."
[[ "${ACTUAL_SRCROOT}" == "${EXPECTED_PROJECT_DIR}" ]] || \
  fail "SRCROOT mismatch. Expected '${EXPECTED_PROJECT_DIR}', got '${ACTUAL_SRCROOT}'."

success "Xcode build settings point to current checkout."
success "Preflight passed. Safe to archive from ${WORKSPACE_PATH}"
