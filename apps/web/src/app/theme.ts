export type Theme = 'light' | 'dark';
export const THEME = 'fitzen.theme';
export function applyTheme(t: Theme) {
  if (t === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f4f4f1' : '#1d1e1b');
}
export const getTheme = (): Theme => { try { return localStorage.getItem(THEME) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } };
