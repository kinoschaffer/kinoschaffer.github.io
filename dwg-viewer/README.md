# DWG Visor

Visor de planos **DWG y DXF** para Android con **zoom vectorial sin pérdida de calidad**.

APK lista para instalar: [`dist/DWG-Visor.apk`](dist/DWG-Visor.apk) (Android 7.0 o superior).

## Funciones

- Abre archivos DWG (R14 a 2018+, incluidos los de AutoCAD actuales) y DXF, sin internet.
- Zoom con pellizco, desplazamiento con un dedo e inercia, doble toque para acercar.
- **Zoom "infinito"**: el plano se vuelve a dibujar como vectores en cada zoom, en doble
  precisión. Las curvas (arcos, círculos, elipses, splines) se recalculan según el tamaño en
  pantalla, así que siguen nítidas a ×1.000.000 o más.
- Capas: encender y apagar cada capa, o todas a la vez.
- Medir **distancia** (con ΔX, ΔY y ángulo), **área y perímetro**, y **coordenadas**, con
  imán a extremos, centros y vértices.
- Fondo oscuro o claro, grosores de línea opcionales.
- Abre archivos desde el gestor de archivos, WhatsApp, Gmail, etc. ("Abrir con…").
- Lista de archivos recientes.

Entidades dibujadas: líneas, polilíneas (con arcos y grosor), círculos, arcos, elipses, splines
(NURBS y por puntos de ajuste), textos y textos de varias líneas, bloques (con escala, giro,
simetría y matrices), atributos, cotas, sombreados (sólidos y con patrón), sólidos, tablas,
directrices, multilíneas, puntos, líneas infinitas y rayos, caras 3D y mallas (vista en planta).

Limitaciones actuales: sólo espacio modelo (sin presentaciones/layouts), las fuentes SHX se
sustituyen por una fuente del sistema, y no se dibujan MULTILEADER, tolerancias, imágenes ni
sólidos 3D ACIS.

## Cómo funciona

- `web/` contiene la app (HTML + JavaScript). El archivo se lee con
  [libredwg](https://www.gnu.org/software/libredwg/) compilado a WebAssembly
  (`@mlightcad/libredwg-web`).
- `web/js/core.js` convierte el dibujo en primitivas vectoriales en coordenadas del mundo
  (bloques expandidos, sistemas de coordenadas de objeto, splines convertidos a Bézier exactas).
- `web/js/render.js` es el motor de dibujo. En cada fotograma transforma todo a píxeles en doble
  precisión, recorta lo que queda fuera de la pantalla y subdivide las curvas según su tamaño en
  pantalla. El canvas nunca recibe coordenadas enormes, y por eso no hay pixelado ni
  "temblores" al hacer mucho zoom. En planos pesados el redibujado se hace por partes y, mientras
  tanto, se muestra la imagen anterior escalada.
- `android/` es una app nativa mínima en Java: un WebView que sirve `web/` desde un origen HTTPS
  local, abre archivos con el selector del sistema y recibe archivos de otras apps.

## Compilar

Requisitos: JDK 17+, Node 18+ y Android SDK con `platforms;android-35` y `build-tools;35.0.0`.

```bash
cd dwg-viewer
ANDROID_HOME=/ruta/al/android-sdk ./build.sh
# -> build/DWG-Visor.apk
```

El script no usa Gradle: llama directamente a `aapt2`, `javac`, `d8`, `zipalign` y `apksigner`.
La primera vez crea una clave de firma en `android/visor.keystore`. Guárdala: para instalar una
versión nueva encima de la anterior, las dos tienen que estar firmadas con la misma clave.

Para probar la parte web en el ordenador:

```bash
npm install && npm run vendor
cd web && python3 -m http.server 8000   # abrir http://localhost:8000
```

## Licencia

GPL-3.0, por usar libredwg (GPL-3.0). El plano `web/samples/ejemplo.dwg` es un archivo de prueba
de libredwg.
