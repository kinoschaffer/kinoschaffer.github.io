// Copia el lector libredwg (WebAssembly) dentro de web/vendor
import fs from 'fs';
import path from 'path';
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const src = path.join(root, 'node_modules/@mlightcad/libredwg-web');
const dst = path.join(root, 'web/vendor');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.join(dst, 'dist'), { recursive: true });
fs.mkdirSync(path.join(dst, 'wasm'), { recursive: true });
fs.copyFileSync(path.join(src, 'dist/libredwg-web.js'), path.join(dst, 'dist/libredwg-web.js'));
for (const f of ['libredwg-web.js', 'libredwg-web.wasm']) fs.copyFileSync(path.join(src, 'wasm', f), path.join(dst, 'wasm', f));
console.log('vendor listo en', dst);
