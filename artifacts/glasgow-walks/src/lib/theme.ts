import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getPreferredTheme(): Theme {
  const stored = localStorage.getItem('wander-glasgow-theme') as Theme | null;
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
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
  localStorage.setItem('wander-glasgow-theme', theme);
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
