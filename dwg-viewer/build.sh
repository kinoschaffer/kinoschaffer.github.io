#!/usr/bin/env bash
# Compila la APK sin Gradle, usando directamente las herramientas del Android SDK.
# Requisitos: JDK 17+, Node 18+, Android SDK con platforms;android-35 y build-tools;35.0.0
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
OUT=build
KEYSTORE="${KEYSTORE:-android/visor.keystore}"

[ -d node_modules/@mlightcad/libredwg-web ] || npm install --no-audit --no-fund
node scripts/vendor.mjs

rm -rf "$OUT" && mkdir -p "$OUT/assets/www" "$OUT/classes" "$OUT/gen"
cp -r web/. "$OUT/assets/www/"

echo "> recursos"
"$BT/aapt2" compile --dir android/res -o "$OUT/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest android/AndroidManifest.xml \
  -A "$OUT/assets" -o "$OUT/unsigned.apk" "$OUT/res.zip" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$OUT/gen"

echo "> java"
javac -source 11 -target 11 -nowarn -Xlint:-options -encoding UTF-8 -classpath "$JAR" \
  -d "$OUT/classes" $(find android/src "$OUT/gen" -name '*.java')
"$BT/d8" --min-api 24 --lib "$JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)

echo "> firma"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass android -keypass android \
    -alias visor -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=DWG Visor" >/dev/null 2>&1
fi
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/DWG-Visor.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/DWG-Visor.apk"
ls -lh "$OUT/DWG-Visor.apk"
