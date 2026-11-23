#!/bin/bash
# Compila el APK sin Gradle. Requiere ANDROID_HOME con build-tools 34 y platform 34,
# y la clave en $KEYSTORE (por defecto android/release.keystore, alias "trono").
set -e
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:-/opt/android-sdk}; BT=$SDK/build-tools/34.0.0; JAR=$SDK/platforms/android-34/android.jar
KEYSTORE=${KEYSTORE:-release.keystore}; OUT=${OUT:-../tronos/JuegosDelTrono.apk}
B=$(mktemp -d); mkdir -p $B/classes $B/dex
cp ../tronos/*.html ../tronos/win98.css ../tronos/win98.js assets/
$BT/aapt2 compile --dir res -o $B/res.zip
$BT/aapt2 link -o $B/base.apk -I $JAR --manifest AndroidManifest.xml -A assets $B/res.zip
javac -nowarn --release 8 -cp $JAR -d $B/classes src/com/lineasdeltrono/app/*.java
$BT/d8 --release --min-api 21 --lib $JAR --output $B/dex $(find $B/classes -name '*.class')
(cd $B/dex && zip -q $B/base.apk classes.dex)
$BT/zipalign -f 4 $B/base.apk $B/aligned.apk
$BT/apksigner sign --ks $KEYSTORE --ks-key-alias trono --out $OUT $B/aligned.apk
rm -f $OUT.idsig; rm -rf $B
echo "APK: $OUT"
