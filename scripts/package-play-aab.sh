#!/usr/bin/env bash
# Copy the release AAB to dist/ with a unique name + fingerprint sidecar.
# Use this file for Play Console upload (never a generic app-release.aab from Downloads).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
EXPECTED_SHA1='8E:91:95:0F:1F:BB:64:06:37:15:E4:2B:8B:82:13:66:BA:03:28:C2'

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: Build AAB first: ./scripts/android-bundle-release.sh"
  exit 1
fi

ACTUAL_SHA1="$(keytool -printcert -jarfile "$SRC" 2>/dev/null | awk -F': ' '/SHA1:/ {print $2; exit}')"
if [[ "$ACTUAL_SHA1" != "$EXPECTED_SHA1" ]]; then
  echo "ERROR: AAB SHA1 mismatch."
  echo "  Expected: $EXPECTED_SHA1"
  echo "  Got:      ${ACTUAL_SHA1:-unknown}"
  exit 1
fi

VERSION="$(node -p "require('$ROOT/app.config.js').expo?.version || '0.0.0'" 2>/dev/null || echo '0.0.0')"
SHA256="$(sha256sum "$SRC" | awk '{print $1}')"
SHORT_SHA256="${SHA256:0:12}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT/dist/play-upload"
mkdir -p "$OUT_DIR"

DEST="$OUT_DIR/RadarFlow-${VERSION}-play-${STAMP}-${SHORT_SHA256}.aab"
META="$DEST.txt"

cp "$SRC" "$DEST"
ls -lh "$DEST"

cat >"$META" <<EOF
Radar Flow — Play Console upload bundle
=========================================
Package: com.radartinder.app
Version: $VERSION
Built:   $STAMP UTC
Path:    $DEST
Size:    $(stat -c%s "$DEST" 2>/dev/null || stat -f%z "$DEST") bytes
SHA256:  $SHA256
SHA1:    $ACTUAL_SHA1

Upload ONLY this .aab file to Play Console.
Upload key must match Play Console → App integrity → Upload key certificate (8E:91:95:...).

Before upload in Play Console:
1. Remove any failed app-release.aab from the release draft (click X).
2. Upload this uniquely named file from dist/play-upload/.
3. Confirm file size and SHA256 match this sidecar on the machine you upload from.
EOF

echo ""
echo "==> Play upload package ready:"
echo "$DEST"
echo "$META"
echo ""
echo "SHA256: $SHA256"
echo "SHA1:   $ACTUAL_SHA1"
echo ""
echo "If you upload from another computer, copy THIS file first (scp/rsync), not an old app-release.aab."
