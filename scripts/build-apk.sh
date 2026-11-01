#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash "$ROOT_DIR/scripts/setup-toolchain.sh"

VERSION_NAME="1.8.6"
VERSION_CODE="15"
APK_FILENAME="Ghost-v${VERSION_NAME}.apk"

TOOLCHAIN_DIR="${ANDROID_TOOLCHAIN_DIR:-/tmp/android-toolchain}"
JAVA_BIN="${JAVA_BIN:-/tmp/jdk-venv/lib/python3.11/site-packages/jdk4py/java-runtime/bin/java}"
KEYTOOL_BIN="${KEYTOOL_BIN:-/tmp/jdk-venv/lib/python3.11/site-packages/jdk4py/java-runtime/bin/keytool}"

AAPT2="$TOOLCHAIN_DIR/aapt2"
ZIPALIGN="$TOOLCHAIN_DIR/zipalign"
ANDROID_JAR="$TOOLCHAIN_DIR/platforms/android-34/android.jar"
JDT_JAR="$TOOLCHAIN_DIR/lib/jdt17.jar"
D8_JAR="$TOOLCHAIN_DIR/lib/d8.jar"
APKSIGNER_JAR="$TOOLCHAIN_DIR/lib/apksigner.jar"
export LD_LIBRARY_PATH="$TOOLCHAIN_DIR/lib64:${LD_LIBRARY_PATH:-}"

STAGE_DIR="/tmp/ghost-apk-stage"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/assets/www" "$STAGE_DIR/gen" "$STAGE_DIR/classes" "$STAGE_DIR/dex" "$ROOT_DIR/releases"

echo "=== [1/7] Building Ghost v${VERSION_NAME} Frontend Assets (Vite) ==="
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  npm install
fi
npm run build
cp -r "$ROOT_DIR/dist/"* "$STAGE_DIR/assets/www/"

echo "=== [2/7] Compiling Android Resources (aapt2 compile) ==="
"$AAPT2" compile \
  --dir "$ROOT_DIR/android/app/src/main/res" \
  -o "$STAGE_DIR/compiled_res.zip"

echo "=== [3/7] Linking APK Resources & AndroidManifest.xml (aapt2 link) ==="
"$AAPT2" link \
  -I "$ANDROID_JAR" \
  --manifest "$ROOT_DIR/android/app/src/main/AndroidManifest.xml" \
  -A "$STAGE_DIR/assets" \
  --java "$STAGE_DIR/gen" \
  --min-sdk-version 26 \
  --target-sdk-version 34 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  --auto-add-overlay \
  -o "$STAGE_DIR/ghost-unaligned.apk" \
  "$STAGE_DIR/compiled_res.zip"

echo "=== [4/7] Compiling Native Android Java Sources (ECJ -> Java 8 Bytecode) ==="
JAVA_SOURCES=()
while IFS= read -r -d '' f; do
  JAVA_SOURCES+=("$f")
done < <(find "$ROOT_DIR/android/app/src/main/java" "$STAGE_DIR/gen" -name "*.java" -print0)

"$JAVA_BIN" -cp "$JDT_JAR" org.eclipse.jdt.internal.compiler.batch.Main \
  -1.8 \
  -nowarn \
  -bootclasspath "$ANDROID_JAR" \
  -d "$STAGE_DIR/classes" \
  "${JAVA_SOURCES[@]}"

echo "=== [5/7] Compiling Dalvik/ART DEX Bytecode (Google D8) ==="
CLASS_FILES=()
while IFS= read -r -d '' cf; do
  CLASS_FILES+=("$cf")
done < <(find "$STAGE_DIR/classes" -name "*.class" -print0)

"$JAVA_BIN" -cp "$D8_JAR" com.android.tools.r8.D8 \
  --release \
  --min-api 26 \
  --lib "$ANDROID_JAR" \
  --output "$STAGE_DIR/dex" \
  "${CLASS_FILES[@]}"

zip -q -j "$STAGE_DIR/ghost-unaligned.apk" "$STAGE_DIR/dex/classes.dex"

echo "=== [6/7] Aligning & Signing Release APK (zipalign + apksigner v2/v3) ==="
"$ZIPALIGN" -f -p 4 "$STAGE_DIR/ghost-unaligned.apk" "$STAGE_DIR/ghost-aligned.apk"

KEYSTORE="/tmp/ghost-release-signing.jks"
if [ ! -f "$KEYSTORE" ]; then
  "$KEYTOOL_BIN" -genkeypair \
    -keystore "$KEYSTORE" \
    -storepass "ghostandroid2026" \
    -keypass "ghostandroid2026" \
    -alias "ghost-release" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Ghost WhatsApp Scheduler, OU=Mobile, O=Ghost, L=Mumbai, ST=MH, C=IN"
fi

rm -f "$ROOT_DIR/releases/Ghost-v1.0.0.apk" "$ROOT_DIR/releases/Ghost-v1.1.0.apk" "$ROOT_DIR/releases/Ghost-v1.2.0.apk" "$ROOT_DIR/releases/Ghost-v1.3.0.apk" "$ROOT_DIR/releases/Ghost-v1.4.0.apk" "$ROOT_DIR/releases/Ghost-v1.5.0.apk" "$ROOT_DIR/releases/Ghost-v1.6.0.apk" "$ROOT_DIR/releases/Ghost-v1.7.0.apk" "$ROOT_DIR/releases/Ghost-v1.8.0.apk" "$ROOT_DIR/releases/Ghost-v1.8.1.apk" "$ROOT_DIR/releases/Ghost-v1.8.2.apk" "$ROOT_DIR/releases/Ghost-v1.8.3.apk"
OUT_APK="$ROOT_DIR/releases/${APK_FILENAME}"
"$JAVA_BIN" -jar "$APKSIGNER_JAR" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "ghost-release" \
  --ks-pass pass:ghostandroid2026 \
  --key-pass pass:ghostandroid2026 \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$OUT_APK" \
  "$STAGE_DIR/ghost-aligned.apk"

rm -f "$OUT_APK.idsig"

echo "=== [7/7] Verifying Signed APK Integrity ==="
"$ZIPALIGN" -c 4 "$OUT_APK"
"$JAVA_BIN" -jar "$APKSIGNER_JAR" verify --verbose "$OUT_APK"
"$AAPT2" dump badging "$OUT_APK" | sed -n '1,18p' || true

python3 - << PY
import hashlib, json, datetime

apk_path = "releases/${APK_FILENAME}"
with open(apk_path, "rb") as f:
    data = f.read()

meta = {
    "available": True,
    "fileName": "${APK_FILENAME}",
    "packageName": "ai.ghost.agent",
    "versionName": "${VERSION_NAME}",
    "versionCode": ${VERSION_CODE},
    "minSdk": 26,
    "targetSdk": 34,
    "sizeBytes": len(data),
    "sha256": hashlib.sha256(data).hexdigest(),
    "builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "signatureSchemes": [
        "APK Signature Scheme v2 (Verified)",
        "APK Signature Scheme v3 (Verified)"
    ]
}
with open("releases/apk-metadata.json", "w") as out:
    json.dump(meta, out, indent=2)
print("Wrote releases/apk-metadata.json — APK Size:", len(data), "bytes")
PY
