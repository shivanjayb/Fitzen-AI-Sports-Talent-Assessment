export type Theme = 'light' | 'dark';
export const THEME = 'fitzen.theme';
export function applyTheme(t: Theme) {
  if (t === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
export const getTheme = (): Theme => { try { return localStorage.getItem(THEME) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } };
