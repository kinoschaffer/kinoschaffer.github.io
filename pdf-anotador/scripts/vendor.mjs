// Copia pdf.js y pdf-lib dentro de web/vendor
import fs from 'fs';
import path from 'path';
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const nm = path.join(root, 'node_modules');
const dst = path.join(root, 'web/vendor');
fs.rmSync(dst, { recursive: true, force: true });
const cp = (a, b) => { fs.mkdirSync(path.dirname(path.join(dst, b)), { recursive: true }); fs.cpSync(path.join(nm, a), path.join(dst, b), { recursive: true }); };
cp('pdfjs-dist/legacy/build/pdf.min.mjs', 'pdfjs/pdf.min.mjs');
cp('pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs');
cp('pdfjs-dist/cmaps', 'pdfjs/cmaps');
cp('pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts');
cp('pdfjs-dist/iccs', 'pdfjs/iccs');
for (const f of ['jbig2.wasm', 'jbig2_nowasm_fallback.js', 'openjpeg.wasm', 'openjpeg_nowasm_fallback.js', 'qcms_bg.wasm']) cp('pdfjs-dist/wasm/' + f, 'pdfjs/wasm/' + f);
cp('pdfjs-dist/LICENSE', 'pdfjs/LICENSE');
cp('pdf-lib/dist/pdf-lib.esm.min.js', 'pdf-lib/pdf-lib.esm.min.js');
cp('pdf-lib/LICENSE.md', 'pdf-lib/LICENSE.md');
console.log('vendor listo en', dst);
