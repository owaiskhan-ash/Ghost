#!/usr/bin/env bash
set -euo pipefail

TOOLCHAIN_DIR="${ANDROID_TOOLCHAIN_DIR:-/tmp/android-toolchain}"
JDK_VENV="${JDK_VENV:-/tmp/jdk-venv}"

if [ -f "$TOOLCHAIN_DIR/aapt2" ] && [ -f "$TOOLCHAIN_DIR/lib/d8.jar" ] && [ -f "$TOOLCHAIN_DIR/lib/jdt17.jar" ] && [ -f "$TOOLCHAIN_DIR/platforms/android-34/android.jar" ] && [ -d "$JDK_VENV" ]; then
  echo "Android toolchain already ready at $TOOLCHAIN_DIR"
  exit 0
fi

echo "=== Bootstrapping Android SDK Build Toolchain in $TOOLCHAIN_DIR ==="
mkdir -p "$TOOLCHAIN_DIR/lib" "$TOOLCHAIN_DIR/lib64" "$TOOLCHAIN_DIR/platforms/android-34" /tmp/ghost-npm-pack

if [ ! -d "$JDK_VENV" ]; then
  python3 -m venv "$JDK_VENV"
  "$JDK_VENV/bin/pip" install -q "jdk4py<22"
fi

pushd /tmp/ghost-npm-pack >/dev/null
npm pack -q @ctxo/lang-java-analyzer
tar -zxf ctxo-lang-java-analyzer-*.tgz
cp package/jar/ctxo-jdt-analyzer-17.jar "$TOOLCHAIN_DIR/lib/jdt17.jar"
popd >/dev/null
rm -rf /tmp/ghost-npm-pack

python3 - << 'PY'
import subprocess, json, os

tc = os.environ.get("ANDROID_TOOLCHAIN_DIR", "/tmp/android-toolchain")

def fetch_blob(repo, path, dest):
    parent = os.path.dirname(path)
    name = os.path.basename(path)
    cmd = ["gh", "api", f"repos/{repo}/contents/{parent}" if parent else f"repos/{repo}/contents"]
    items = json.loads(subprocess.check_output(cmd))
    sha = next(it["sha"] for it in items if it["name"] == name)
    size = next(it["size"] for it in items if it["name"] == name)
    print(f"  Fetching {name} ({size} bytes) -> {dest}")
    with open(dest, "wb") as f:
        subprocess.check_call(["gh", "api", "-H", "Accept: application/vnd.github.raw", f"repos/{repo}/git/blobs/{sha}"], stdout=f)

fetch_blob("Sable/android-platforms", "android-34/android.jar", f"{tc}/platforms/android-34/android.jar")
fetch_blob("screetsec/TheFatRat", "tools/android-sdk/lib/d8.jar", f"{tc}/lib/d8.jar")

base = "android_unpinner/vendor/build_tools/linux"
fetch_blob("mitmproxy/android-unpinner", f"{base}/aapt2", f"{tc}/aapt2")
fetch_blob("mitmproxy/android-unpinner", f"{base}/zipalign", f"{tc}/zipalign")
fetch_blob("mitmproxy/android-unpinner", f"{base}/lib/apksigner.jar", f"{tc}/lib/apksigner.jar")
fetch_blob("mitmproxy/android-unpinner", f"{base}/lib64/libc++.so", f"{tc}/lib64/libc++.so")
PY

chmod +x "$TOOLCHAIN_DIR/aapt2" "$TOOLCHAIN_DIR/zipalign"
echo "=== Toolchain ready ==="
