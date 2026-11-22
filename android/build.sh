#!/usr/bin/env bash
# Compila la APK de Fiesta Tablero sin Gradle (sólo herramientas del Android SDK).
# Uso: ANDROID_HOME=/ruta/sdk KEYSTORE=fiesta.jks KS_PASS=clave ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:?Define ANDROID_HOME}
BT=$SDK/build-tools/35.0.0
JAR=$SDK/platforms/android-35/android.jar
OUT=build; rm -rf $OUT; mkdir -p $OUT/assets $OUT/classes $OUT/compiled

# 1) Juego web completo (con Three.js, PeerJS y modelos 3D incluidos)
mkdir -p $OUT/assets/www
(cd ../fiesta && tar --exclude='*.apk' -cf - .) | tar -xf - -C $OUT/assets/www

# 2) Recursos, código y empaquetado
$BT/aapt2 compile --dir res -o $OUT/compiled/res.zip
$BT/aapt2 link -o $OUT/unsigned.apk -I "$JAR" --manifest AndroidManifest.xml \
  --min-sdk-version 24 --target-sdk-version 35 -A $OUT/assets --java $OUT/gen $OUT/compiled/res.zip
javac -source 11 -target 11 -nowarn -classpath "$JAR" -d $OUT/classes $(find src $OUT/gen -name '*.java')
$BT/d8 --min-api 24 --lib "$JAR" --output $OUT $(find $OUT/classes -name '*.class')
(cd $OUT && zip -qj unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk
$BT/apksigner sign --ks "${KEYSTORE:?Define KEYSTORE}" --ks-pass "pass:${KS_PASS:?Define KS_PASS}" \
  --v4-signing-enabled false --out ../fiesta/fiesta-tablero.apk $OUT/aligned.apk
echo "APK lista: fiesta/fiesta-tablero.apk"
