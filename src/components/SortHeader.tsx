import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortState } from '../domain/sorting';

interface Props<K extends string> { label: string; sortKey: K; sort: SortState<K> | null; onSort: (key: K) => void }
export function SortHeader<K extends string>({ label, sortKey, sort, onSort }: Props<K>) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={`sort-button ${active ? 'active' : ''}`} onClick={() => onSort(sortKey)}>{label}<Icon size={13} aria-hidden="true" /></button>
  </th>;
}
