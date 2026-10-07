export type Theme = 'light' | 'dark' | 'system';
export const THEME_STORAGE_KEY = 'wander-glasgow-theme';
export const THEME_REMEMBER_STORAGE_KEY = 'wander-glasgow-remember-theme';
const LEGACY_THEME_STORAGE_KEY = 'theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readThemePersistence(): boolean {
  try {
    return localStorage.getItem(THEME_REMEMBER_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function forgetSavedThemePreference() {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // Storage may be unavailable or disabled by the browser.
  }
}

export function persistThemeChoice(theme: Theme) {
  if (!readThemePersistence()) {
    forgetSavedThemePreference();
    return;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // Storage may be unavailable or disabled by the browser.
  }
}

export function setThemePersistence(remember: boolean, theme: Theme) {
  try {
    localStorage.setItem(THEME_REMEMBER_STORAGE_KEY, String(remember));
  } catch {
    // Storage may be unavailable or disabled by the browser.
  }

  if (remember) persistThemeChoice(theme);
  else forgetSavedThemePreference();
}

function getPreferredTheme(): Theme {
  if (!readThemePersistence()) {
    forgetSavedThemePreference();
    return getSystemTheme();
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;

    // Keep a theme chosen before the browser-storage setting was added.
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (isTheme(legacy)) {
      localStorage.setItem(THEME_STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      return legacy;
    }
  } catch {
    // Fall through to the device's appearance preference.
  }
  return getSystemTheme();
}

export function initializeTheme() {
  const preferred = getPreferredTheme();
  const systemTheme = getSystemTheme();

  if (preferred === 'system') {
    document.documentElement.classList.toggle('dark', systemTheme === 'dark');
    document.documentElement.setAttribute('data-theme', systemTheme);
    return systemTheme;
  }

  document.documentElement.classList.toggle('dark', preferred === 'dark');
  document.documentElement.setAttribute('data-theme', preferred);
  return preferred;
}

export function setTheme(theme: Theme) {
  persistThemeChoice(theme);
  const systemTheme = getSystemTheme();
  if (theme === 'system') {
    document.documentElement.classList.toggle('dark', systemTheme === 'dark');
    document.documentElement.setAttribute('data-theme', systemTheme);
  } else {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const themeMap: Record<string, Theme> = {
    light: 'dark',
    dark: 'system',
    system: 'light',
  };
  setTheme(themeMap[current]);
}
