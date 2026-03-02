#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_PATH="${1:-}"

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

if [[ -z "${ARTIFACT_PATH}" ]]; then
  fail "Usage: bash scripts/android-verify-16kb.sh <path-to-aab-or-apk>"
fi

if [[ ! -f "${ARTIFACT_PATH}" ]]; then
  fail "Artifact not found: ${ARTIFACT_PATH}"
fi

ARTIFACT_EXT="$(echo "${ARTIFACT_PATH##*.}" | tr '[:upper:]' '[:lower:]')"
if [[ "${ARTIFACT_EXT}" != "aab" && "${ARTIFACT_EXT}" != "apk" ]]; then
  fail "Unsupported artifact extension: .${ARTIFACT_EXT} (expected .aab or .apk)"
fi

if ! command -v objdump >/dev/null 2>&1; then
  fail "objdump not found. Install binutils/llvm tools first."
fi

TMP_DIR="$(mktemp -d -t rt-android-16kb.XXXXXX)"
trap 'rm -rf "${TMP_DIR}"' EXIT

resolve_zipalign() {
  if command -v zipalign >/dev/null 2>&1; then
    command -v zipalign
    return 0
  fi

  local sdk_root=""
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    sdk_root="${ANDROID_HOME}"
  elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
    sdk_root="${ANDROID_SDK_ROOT}"
  fi

  if [[ -n "${sdk_root}" && -d "${sdk_root}/build-tools" ]]; then
    local candidate
    candidate="$(find "${sdk_root}/build-tools" -type f -name zipalign | sort | tail -n 1)"
    if [[ -n "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  fi

  return 1
}

dump_aab_config() {
  local bundle_path="$1"
  if command -v bundletool >/dev/null 2>&1; then
    bundletool dump config --bundle "${bundle_path}"
    return 0
  fi

  if [[ -n "${BUNDLETOOL_JAR:-}" ]]; then
    if ! command -v java >/dev/null 2>&1; then
      fail "java is required when using BUNDLETOOL_JAR."
    fi
    java -jar "${BUNDLETOOL_JAR}" dump config --bundle "${bundle_path}"
    return 0
  fi

  fail "bundletool not found. Add to PATH or set BUNDLETOOL_JAR."
}

validate_load_alignment() {
  local so_file="$1"
  local align_values
  align_values="$(objdump -p "${so_file}" | sed -nE 's/.*align 2\\*\\*([0-9]+).*/\\1/p')"

  if [[ -z "${align_values}" ]]; then
    return 0
  fi

  local bad_alignment=0
  while IFS= read -r align; do
    [[ -z "${align}" ]] && continue
    if [[ "${align}" -lt 14 ]]; then
      bad_alignment=1
      break
    fi
  done <<< "${align_values}"

  [[ "${bad_alignment}" -eq 0 ]]
}

if [[ "${ARTIFACT_EXT}" == "aab" ]]; then
  info "Checking AAB page alignment config with bundletool..."
  BUNDLE_CONFIG_PATH="${TMP_DIR}/bundle-config.txt"
  dump_aab_config "${ARTIFACT_PATH}" >"${BUNDLE_CONFIG_PATH}"
  if ! rg -q "PAGE_ALIGNMENT_16K" "${BUNDLE_CONFIG_PATH}"; then
    fail "AAB config does not contain PAGE_ALIGNMENT_16K."
  fi
  success "AAB config contains PAGE_ALIGNMENT_16K."
fi

if [[ "${ARTIFACT_EXT}" == "apk" ]]; then
  info "Checking APK zip alignment with 16 KB pages..."
  ZIPALIGN_BIN="$(resolve_zipalign || true)"
  [[ -n "${ZIPALIGN_BIN}" ]] || fail "zipalign not found. Add Android build-tools to PATH."
  "${ZIPALIGN_BIN}" -c -P 16 4 "${ARTIFACT_PATH}" >/dev/null
  success "APK zipalign check passed with -P 16."
fi

info "Scanning native .so files for ELF LOAD alignment..."
SO_LIST_PATH="${TMP_DIR}/native-so-paths.txt"
unzip -Z1 "${ARTIFACT_PATH}" | rg '\.so$' >"${SO_LIST_PATH}" || true

if [[ ! -s "${SO_LIST_PATH}" ]]; then
  fail "No native .so files found in artifact."
fi

FAILED_SO_PATHS="${TMP_DIR}/failed-so-paths.txt"
touch "${FAILED_SO_PATHS}"

while IFS= read -r so_path; do
  [[ -z "${so_path}" ]] && continue
  extracted_so="${TMP_DIR}/libcheck.so"
  unzip -p "${ARTIFACT_PATH}" "${so_path}" >"${extracted_so}"
  if ! validate_load_alignment "${extracted_so}"; then
    echo "${so_path}" >>"${FAILED_SO_PATHS}"
  fi
done <"${SO_LIST_PATH}"

if [[ -s "${FAILED_SO_PATHS}" ]]; then
  echo "[ERROR] Found .so files with LOAD alignment below 16 KB:" >&2
  cat "${FAILED_SO_PATHS}" >&2
  exit 1
fi

success "All native .so files are aligned for 16 KB pages."
success "Android 16 KB verification passed for ${ARTIFACT_PATH}"
