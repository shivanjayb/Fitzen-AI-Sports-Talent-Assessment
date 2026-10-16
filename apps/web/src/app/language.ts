import { useSyncExternalStore } from 'react';
import type { ExerciseDef } from '@fitzen/engines';

export const LANGUAGES = [['en', 'English'], ['hi', 'हिन्दी'], ['mr', 'मराठी'], ['ta', 'தமிழ்'], ['te', 'తెలుగు']] as const;
export type Language = (typeof LANGUAGES)[number][0];
const isLanguage = (v: unknown): v is Language => LANGUAGES.some(([code]) => code === v);

let language: Language = 'en';
let words: Record<string, string> = {};
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const useLanguage = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, getLanguage);

/** Each dictionary is its own chunk, so a phone downloads only the language it uses (the service worker precaches all for offline). */
export async function setLanguage(value: Language) {
  words = value === 'en' ? {} : ((await import(`./i18n/${value}.json`)) as { default: Record<string, string> }).default;
  language = value;
  try { localStorage.setItem('fitzen.language', value); } catch { /* this tab only */ }
  document.documentElement.lang = value;
  listeners.forEach((f) => f());
}

let saved: unknown = null;
try { saved = localStorage.getItem('fitzen.language'); } catch { /* use English */ }
/** Resolves once the saved language is loaded, so the first paint is already translated. */
export const languageReady: Promise<void> = isLanguage(saved) && saved !== 'en' ? setLanguage(saved).catch(() => {}) : Promise.resolve();

/** English text is the key. `{name}` placeholders are filled from `vars` after translation, so word order can change per language. */
export const t = (text: string, vars?: Record<string, string | number>) => {
  const out = words[text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m)) : out;
};
export const setupFor = (ex: ExerciseDef) => ex.setup.map((s) => t(s));
