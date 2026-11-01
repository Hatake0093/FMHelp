import { useEffect, useRef, useState } from 'react';
import type { DynastyState } from '../domain/model.ts';
import * as files from './file-sync.ts';

export type SyncStatus = 'unsupported' | 'unlinked' | 'needs-access' | 'synced' | 'saving' | 'conflict' | 'error';
interface Options { state: DynastyState; ready: boolean; onLoad: (state: DynastyState) => void }
interface External { state: DynastyState; modified: number }

const WRITE_DELAY_MS = 700;
const reason = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError' ? 'No se encuentra el archivo vinculado. Vincula otro.'
  : error instanceof Error ? error.message : 'No se pudo usar el archivo vinculado.';

// Mantiene un archivo JSON como fuente de verdad: lo lee al arrancar y lo reescribe tras cada cambio.
// `modified` es la última fecha del archivo que esta pestaña vio o escribió; si difiere, otro navegador lo cambió.
export function useFileSync({ state, ready, onLoad }: Options) {
  const [status, setStatusState] = useState<SyncStatus>(files.fileSyncSupported() ? 'unlinked' : 'unsupported');
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const handle = useRef<FileSystemFileHandle>(undefined);
  const statusRef = useRef(status);
  const modified = useRef(0);
  const dirty = useRef(false);
  const synced = useRef<DynastyState | null>(null);
  const pending = useRef<External | null>(null);
  const latest = useRef(state);
  const loader = useRef(onLoad);
  const queue = useRef<Promise<void>>(Promise.resolve());
  latest.current = state;
  loader.current = onLoad;

  const setStatus = (next: SyncStatus, text = '') => { statusRef.current = next; setStatusState(next); setMessage(text); };
  const remember = () => { if (handle.current) void files.saveLink({ handle: handle.current, modified: modified.current, dirty: dirty.current }).catch(() => undefined); };
  // Las escrituras se encadenan: nunca hay dos createWritable simultáneos sobre el mismo archivo.
  const enqueue = (task: () => Promise<void>) => { queue.current = queue.current.then(task, task); return queue.current; };

  const adopt = (external: External, text: string) => {
    modified.current = external.modified; dirty.current = false; pending.current = null; synced.current = external.state;
    loader.current(external.state); remember(); setStatus('synced', text);
  };
  const conflict = (external: External) => { pending.current = external; setStatus('conflict', 'El archivo cambió desde otro navegador o programa mientras había cambios sin guardar aquí.'); };

  async function push(force = false) {
    const target = handle.current; if (!target) return;
    const snapshot = latest.current;
    setStatus('saving');
    try {
      if (!force && await files.currentModified(target) !== modified.current) {
        const external = await files.readFile(target);
        if (dirty.current) { conflict(external); return; }
        adopt(external, 'Datos actualizados desde el archivo.'); return;
      }
      modified.current = await files.writeFile(target, snapshot);
      synced.current = snapshot; dirty.current = latest.current !== snapshot; remember();
      setStatus('synced');
    } catch (error) { setStatus('error', reason(error)); }
  }

  async function reconcile() {
    const target = handle.current; if (!target) return;
    try {
      if (await files.currentModified(target) === modified.current) {
        if (dirty.current) { await push(); return; }
        synced.current = latest.current; setStatus('synced'); return;
      }
      const external = await files.readFile(target);
      if (dirty.current) conflict(external); else adopt(external, 'Datos cargados desde el archivo.');
    } catch (error) { setStatus('error', reason(error)); }
  }

  // Arranque: recupera el archivo vinculado de la sesión anterior.
  useEffect(() => {
    if (!ready || !files.fileSyncSupported()) return;
    let cancelled = false;
    void (async () => {
      const link = await files.savedLink().catch(() => undefined);
      if (cancelled || !link) return;
      handle.current = link.handle; modified.current = link.modified; dirty.current = link.dirty; setFileName(link.handle.name);
      if (await files.hasAccess(link.handle).catch(() => false)) await enqueue(reconcile);
      else setStatus('needs-access', 'Chrome pide confirmar el acceso al archivo en cada sesión.');
    })();
    return () => { cancelled = true; };
  }, [ready]);

  // Cada cambio de la partida se escribe en el archivo tras una pausa breve.
  useEffect(() => {
    if (!ready || !handle.current || state === synced.current) return;
    dirty.current = true; remember();
    if (statusRef.current === 'needs-access' || statusRef.current === 'conflict') return;
    const timer = setTimeout(() => { void enqueue(() => push()); }, WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, ready]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (handle.current && dirty.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const guard = async (action: () => Promise<void>) => {
    try { await action(); } catch (error) { if (!files.isAbort(error)) setStatus('error', reason(error)); }
  };

  return {
    status, fileName, message, supported: files.fileSyncSupported(),
    // Elige dónde crear el archivo y guarda en él la partida actual.
    create: () => guard(async () => {
      const picked = await files.pickNewFile();
      handle.current = picked; setFileName(picked.name); modified.current = 0; synced.current = null; dirty.current = true;
      await enqueue(() => push(true));
    }),
    // Abre un archivo existente y lo convierte en la partida actual (la UI avisa antes de sustituir datos).
    open: () => guard(async () => {
      const picked = await files.pickExistingFile();
      const external = await files.readFile(picked);
      handle.current = picked; setFileName(picked.name);
      adopt(external, 'Partida cargada desde el archivo.');
    }),
    reconnect: () => guard(async () => {
      if (!handle.current) return;
      if (!await files.requestAccess(handle.current)) { setStatus('needs-access', 'Sin permiso no se puede guardar en el archivo.'); return; }
      await enqueue(reconcile);
    }),
    resolve: (choice: 'file' | 'local') => guard(async () => {
      if (choice === 'file' && pending.current) adopt(pending.current, 'Datos cargados desde el archivo.');
      else await enqueue(() => push(true));
    }),
    unlink: () => guard(async () => {
      handle.current = undefined; dirty.current = false; synced.current = null; pending.current = null;
      await files.forgetLink(); setFileName(''); setStatus('unlinked');
    }),
  };
}
