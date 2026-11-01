export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> { key: K; dir: SortDir }

// Primer clic: el sentido natural de la columna (mayor primero en números, A-Z en texto); segundo: inverso; tercero: orden original.
export function nextSort<K extends string>(current: SortState<K> | null, key: K, firstDir: SortDir): SortState<K> | null {
  if (current?.key !== key) return { key, dir: firstDir };
  return current.dir === firstDir ? { key, dir: firstDir === 'asc' ? 'desc' : 'asc' } : null;
}

// Los valores ausentes (null) quedan siempre al final, en cualquier sentido, y los empates se resuelven por nombre.
export function compareBy<T>(sort: SortState<string>, value: (item: T, key: string) => number | string | null, name: (item: T) => string) {
  return (a: T, b: T) => {
    const x = value(a, sort.key), y = value(b, sort.key);
    if (x === null || y === null) { if (x !== y) return x === null ? 1 : -1; }
    else {
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
      if (order) return sort.dir === 'asc' ? order : -order;
    }
    return name(a).localeCompare(name(b), 'es');
  };
}
