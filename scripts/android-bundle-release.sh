#!/usr/bin/env bash
# Build a Play-ready AAB from THIS repo (radar_tinder), with fresh JS bundle + release signing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Project: $ROOT"
echo "==> Version: $(node -p "require('./app.config.js').default?.()?.expo?.version || require('./app.config.js')")" 2>/dev/null || true

if [[ ! -f "$ROOT/@albertfast__radar-tinder.jks" ]]; then
  echo "ERROR: Missing release keystore @albertfast__radar-tinder.jks in project root."
  exit 1
fi

echo "==> Keystore SHA1 (must match Play Console upload key):"
keytool -list -v -keystore "$ROOT/@albertfast__radar-tinder.jks" \
  -storepass '60e1270716eb0e15a2d03cf92e6e12ae' \
  -alias '50bfc63f638af988fe807ff1eb2cd296' 2>/dev/null | grep 'SHA1:' | head -1

echo "==> Removing previous release AAB only (skip ./gradlew clean — breaks RN codegen)..."
rm -f "$ROOT/android/app/build/outputs/bundle/release/app-release.aab"

echo "==> bundleRelease (runs expo export:embed for current JS)..."
cd "$ROOT/android"
./gradlew bundleRelease

AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
if [[ ! -f "$AAB" ]]; then
  echo "ERROR: AAB not found at $AAB"
  exit 1
fi

echo ""
echo "==> Verifying AAB upload certificate..."
node "$ROOT/scripts/verify-android-upload-cert.mjs" --aab "$AAB"

echo ""
bash "$ROOT/scripts/package-play-aab.sh"

echo ""
echo "==> Upload the file from dist/play-upload/ to Play Console (not an old app-release.aab)."
keytool -printcert -jarfile "$AAB" 2>/dev/null | grep 'SHA1:' | head -1
