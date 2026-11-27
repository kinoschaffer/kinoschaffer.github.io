// Guardado automático de anotaciones (IndexedDB), por documento.
const DB = 'pdf-anotador';
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('docs');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
export async function load(key) {
  try {
    const d = await db();
    return await new Promise((res) => {
      const r = d.transaction('docs').objectStore('docs').get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  } catch (e) { return null; }
}
export async function save(key, value) {
  try {
    const d = await db();
    await new Promise((res) => {
      const t = d.transaction('docs', 'readwrite');
      t.objectStore('docs').put(value, key);
      t.oncomplete = res; t.onerror = res;
    });
  } catch (e) { /* sin almacenamiento */ }
}
