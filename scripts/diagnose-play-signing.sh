#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AAB="${1:-$ROOT/android/app/build/outputs/bundle/release/app-release.aab}"

echo "=== Radar Flow Play signing diagnostic ==="
echo "Package (from bundletool): com.radartinder.app"
echo ""

if [[ ! -f "$AAB" ]]; then
  echo "AAB not found: $AAB"
  exit 1
fi

echo "File: $AAB"
ls -lh "$AAB"
echo "SHA256: $(sha256sum "$AAB" | awk '{print $1}')"
echo ""

python3 <<PY
import zipfile, subprocess, re, tempfile, os
aab = "$AAB"
with zipfile.ZipFile(aab) as z:
    sigs = [n for n in z.namelist() if n.startswith('META-INF/') and n.endswith(('.RSA','.DSA','.EC'))]
    print('Signature files in AAB:', sigs or '(none)')
    for name in sigs:
        data = z.read(name)
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(name)[1]) as f:
            f.write(data)
            p = f.name
        out = subprocess.check_output(['keytool','-printcert','-file',p], stderr=subprocess.STDOUT, text=True)
        os.unlink(p)
        sha1 = re.search(r'SHA1:\s*([A-F0-9:]+)', out)
        print(f'  {name} -> {sha1.group(1) if sha1 else "?"}')
PY

echo ""
echo "keytool -printcert:"
keytool -printcert -jarfile "$AAB" 2>/dev/null | /usr/bin/grep SHA1 || true

echo ""
echo "=== Keystores in repo ==="
for ks in "$ROOT/@albertfast__radar-tinder.jks" "$ROOT/@albertfast__radar-tinder.jks.eas-wrong-8E-backup"; do
  if [[ -f "$ks" ]]; then
    echo "-- $(basename "$ks") --"
    if [[ "$ks" == *eas-wrong* ]]; then
      keytool -list -v -keystore "$ks" -storepass '60e1270716eb0e15a2d03cf92e6e12ae' -alias '50bfc63f638af988fe807ff1eb2cd296' 2>/dev/null | /usr/bin/grep SHA1 || true
    else
      keytool -list -v -keystore "$ks" -storepass '885479cc3b68acabd79c9b33d8c8257b' -alias '73b7ffa0c2b2542ef1e5206b0a29c7aa' 2>/dev/null | /usr/bin/grep SHA1 || true
    fi
  fi
done

echo ""
echo "=== PLAY CONSOLE: compare these yourself ==="
echo "Setup -> App integrity -> App signing"
echo "  1) App signing key certificate SHA-1"
echo "  2) Upload key certificate SHA-1   <-- MUST match AAB above"
echo ""
echo "Upload key 8E:91:95:... = EAS keystore in this repo (Jan 2026) — use for com.radartinder.app"
echo "12:76:27:... = radarbot only (com.radarbot.app), not this app"
echo ""
echo "Navigation trap: open app from Play Console HOME, not the top-left app switcher."
