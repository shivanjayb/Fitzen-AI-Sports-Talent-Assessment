/**
 * Local-only persistence: profile + session history live on this device.
 * No account, no network (email auth removed for now — see App.tsx).
 */
import type { SessionReport } from '@fitzen/engines';

export interface Profile { name: string; weightKg: number | null; heightCm: number | null; age: number | null; model: 'lite' | 'full' | 'heavy'; voice: boolean }
export interface SavedSession { id: string; report: SessionReport; source: 'camera' | 'video' | 'demo' }

const PROFILE = 'fitzen.profile';
const HISTORY = 'fitzen.history';
const MAX = 60; // ponytail: localStorage cap, move to IndexedDB if users need more history

const read = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota / private mode */ } };

export const DEFAULT_PROFILE: Profile = { name: 'Athlete', weightKg: null, heightCm: null, age: null, model: 'full', voice: true };
export const getProfile = (): Profile => ({ ...DEFAULT_PROFILE, ...read<Partial<Profile>>(PROFILE, {}) });
export const saveProfile = (p: Profile) => write(PROFILE, p);

export const getHistory = (): SavedSession[] => read<SavedSession[]>(HISTORY, []);
export const getSession = (id: string) => getHistory().find((s) => s.id === id);
export function saveSession(s: SavedSession): void {
  write(HISTORY, [s, ...getHistory().filter((x) => x.id !== s.id)].slice(0, MAX));
}
export function deleteSession(id: string): void { write(HISTORY, getHistory().filter((s) => s.id !== id)); }

/** Pointer-follow specular highlight for .glass elements. */
export function glow(e: React.PointerEvent<HTMLElement>): void {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}
