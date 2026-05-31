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
  -storepass '60e1270716eb0e15a2d03cf92e6e12ae' 2>/dev/null | grep 'SHA1:' | head -1

echo "==> Cleaning old Android bundle outputs..."
cd "$ROOT/android"
./gradlew clean

echo "==> bundleRelease (runs expo export:embed for current JS)..."
./gradlew bundleRelease

AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
if [[ ! -f "$AAB" ]]; then
  echo "ERROR: AAB not found at $AAB"
  exit 1
fi

echo ""
echo "==> Done. Upload THIS file to Play Console:"
echo "$AAB"
ls -lh "$AAB"
