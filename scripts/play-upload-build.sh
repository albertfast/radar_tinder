#!/usr/bin/env bash
# Build release AAB and copy to /tmp with SHA256 in filename for Play upload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/android"

rm -rf "$ROOT/android/app/build/outputs/bundle/release"
./gradlew :app:bundleRelease --rerun-tasks :app:signReleaseBundle

AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
SHA256="$(sha256sum "$AAB" | awk '{print $1}')"
SHA1="$(keytool -printcert -jarfile "$AAB" 2>/dev/null | awk -F': ' '/SHA1:/ {print $2; exit}')"
EXPECTED='8E:91:95:0F:1F:BB:64:06:37:15:E4:2B:8B:82:13:66:BA:03:28:C2'

if [[ "$SHA1" != "$EXPECTED" ]]; then
  echo "FATAL: AAB SHA1=$SHA1 expected $EXPECTED"
  exit 1
fi

DEST="/tmp/RadarTinder-play-${SHA256:0:16}.aab"
cp "$AAB" "$DEST"

echo ""
echo "BUILD OK"
echo "SHA1:   $SHA1"
echo "SHA256: $SHA256"
echo ""
echo "Play Console'a SADECE su dosyayi yukle:"
echo "$DEST"
echo ""
echo "Yuklemeden once tekrar dogrula:"
echo "  keytool -printcert -jarfile '$DEST' | grep SHA1"
echo "  sha256sum '$DEST'"
