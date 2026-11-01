// Almacén clave-valor mínimo sobre IndexedDB. Los valores se guardan tal cual (cadenas JSON y el handle del archivo vinculado).
const DB_NAME = 'chippenham-dynasty';
const STORE = 'kv';
let opened: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opened = undefined; reject(request.error ?? new Error('IndexedDB no está disponible.')); };
  });
  return opened;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    // Se resuelve al completar la transacción, no al terminar la petición: así el dato ya está confirmado.
    tx.oncomplete = () => resolve(request.result as T);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('No se pudo completar la operación en IndexedDB.'));
  });
}

export const dbGet = <T>(key: string) => run<T | undefined>('readonly', store => store.get(key));
export const dbSet = (key: string, value: unknown) => run<unknown>('readwrite', store => store.put(value, key)).then(() => undefined);
export const dbDelete = (key: string) => run<unknown>('readwrite', store => store.delete(key)).then(() => undefined);
