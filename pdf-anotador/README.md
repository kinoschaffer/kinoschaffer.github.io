# Planos PDF

App Android para **abrir planos en PDF, ampliarlos sin perder calidad y anotarlos**.

APK lista para instalar: [`dist/Planos-PDF.apk`](dist/Planos-PDF.apk) (Android 7.0 o superior).

## Funciones

- **Zoom sin pérdida**: al dejar de mover el dedo, la zona visible se vuelve a dibujar como
  vectores a la resolución exacta de la pantalla. Probado nítido hasta unas 100.000 veces de
  ampliación (en un A1, un texto de 0,8 pt ocupa la pantalla entera).
- **Anotaciones vectoriales**: lápiz, marcador fosforito, línea, flecha, rectángulo, elipse,
  nube de revisión y texto. Tienen 6 colores y 3 grosores, y se pueden borrar, deshacer y rehacer.
- **Medición**: distancias y áreas, en milímetros de papel o en metros reales tras fijar la escala
  (1:50, 1:100…) o calibrar con una cota del plano. Una lupa ayuda a colocar los puntos.
- **Guardado automático**: las anotaciones se guardan solas en el teléfono y vuelven a aparecer al
  abrir el mismo PDF.
- **Exportar PDF anotado**: genera un PDF nuevo con las anotaciones dibujadas como vectores,
  que se ve igual en cualquier lector. Funciona también con páginas giradas o recortadas.
- PDF de varias páginas, "Abrir con…" desde otras apps y lista de recientes.

## Estructura

- `web/js/viewer.js`: dibujo del PDF con [pdf.js](https://mozilla.github.io/pdf.js/). Usa una imagen
  base para moverse con fluidez y un redibujado vectorial de la zona visible al parar.
- `web/js/annot.js`: anotaciones (dibujo, borrado, medidas) y exportación con
  [pdf-lib](https://pdf-lib.js.org/).
- `web/js/app.js`: interfaz, gestos y herramientas. `web/js/store.js`: guardado (IndexedDB).
- `android/`: app nativa mínima en Java (WebView). Abre y guarda archivos con el selector del sistema.

## Compilar

Requisitos: JDK 17+, Node 18+ y Android SDK con `platforms;android-35` y `build-tools;35.0.0`.

```bash
cd pdf-anotador
ANDROID_HOME=/ruta/al/android-sdk ./build.sh   # -> build/Planos-PDF.apk
```

La primera vez se crea la clave de firma `android/planos.keystore`. Guárdala, porque las
actualizaciones tienen que firmarse con la misma clave.

Licencias: pdf.js (Apache-2.0) y pdf-lib (MIT).
