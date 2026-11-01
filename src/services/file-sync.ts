import type { DynastyState } from '../domain/model.ts';
import { dbDelete, dbGet, dbSet } from './db.ts';
import { parseState } from './storage.ts';

// File System Access API (Chrome, Edge, Opera). lib.dom no incluye los selectores ni los permisos.
interface PermissionedHandle extends FileSystemFileHandle {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface FilePickers {
  showSaveFilePicker(options: unknown): Promise<FileSystemFileHandle>;
  showOpenFilePicker(options: unknown): Promise<FileSystemFileHandle[]>;
}
export interface LinkRecord { handle: FileSystemFileHandle; modified: number; dirty: boolean }

const LINK_KEY = 'fileLink';
const PICKER_TYPES = [{ description: 'Partida de Chippenham (JSON)', accept: { 'application/json': ['.json'] } }];
const pickers = () => window as unknown as FilePickers;

export const fileSyncSupported = () => typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
export const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export const pickNewFile = () => pickers().showSaveFilePicker({ suggestedName: 'chippenham-partida.json', types: PICKER_TYPES });
export async function pickExistingFile(): Promise<FileSystemFileHandle> {
  const [handle] = await pickers().showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
  return handle;
}

export const hasAccess = async (handle: FileSystemFileHandle) => (await (handle as PermissionedHandle).queryPermission({ mode: 'readwrite' })) === 'granted';
export const requestAccess = async (handle: FileSystemFileHandle) => (await (handle as PermissionedHandle).requestPermission({ mode: 'readwrite' })) === 'granted';

export const currentModified = async (handle: FileSystemFileHandle) => (await handle.getFile()).lastModified;
export async function readFile(handle: FileSystemFileHandle): Promise<{ state: DynastyState; modified: number }> {
  const file = await handle.getFile();
  // parseState valida todo: un archivo ajeno o dañado nunca llega a sustituir la partida.
  return { state: parseState(await file.text()), modified: file.lastModified };
}
export async function writeFile(handle: FileSystemFileHandle, state: DynastyState): Promise<number> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(state));
  await writable.close();
  return currentModified(handle);
}

export const savedLink = () => dbGet<LinkRecord>(LINK_KEY);
export const saveLink = (record: LinkRecord) => dbSet(LINK_KEY, record);
export const forgetLink = () => dbDelete(LINK_KEY);
