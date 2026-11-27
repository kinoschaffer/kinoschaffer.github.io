// Web Worker: procesa el archivo fuera del hilo de la interfaz.
import { processFile } from './core.js';

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (msg.type !== 'open') return;
  try {
    const data = await processFile(msg.buffer, (text) => self.postMessage({ type: 'progress', text }));
    self.postMessage({ type: 'done', data });
  } catch (err) {
    self.postMessage({ type: 'error', stage: err.stage || 'parse', message: (err && err.message) || String(err) });
  }
};
self.postMessage({ type: 'alive' });
