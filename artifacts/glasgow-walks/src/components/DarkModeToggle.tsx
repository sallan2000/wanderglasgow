'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { forgetSavedThemePreference } from '@/lib/theme';

export function DarkModeToggle({
  rememberTheme,
  onRememberThemeChange,
}: {
  rememberTheme: boolean;
  onRememberThemeChange: (remember: boolean) => void;
}) {
  const { theme: externalTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setMounted(true);
    const match = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light');
    setSystemTheme(match.matches ? 'dark' : 'light');
    match.addEventListener('change', updateSystemTheme);
    return () => match.removeEventListener('change', updateSystemTheme);
  }, []);

  const current = externalTheme ?? 'system';

  const cycleTheme = () => {
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
    setTheme(next);
    if (!rememberTheme) forgetSavedThemePreference();
  };

  if (!mounted) return null;

  return (
    <div className="theme-controls">
      <button
        type="button"
        onClick={cycleTheme}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Switch to ${current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light'} mode`}
        aria-describedby="theme-storage-description"
        title="Change appearance mode"
        data-testid="button-theme-toggle"
      >
        {current === 'light' ? <Moon size={16} /> : current === 'dark' ? <Monitor size={16} /> : <Sun size={16} />}
      </button>
      <label className="theme-save-control">
        <input
          type="checkbox"
          checked={rememberTheme}
          onChange={(event) => onRememberThemeChange(event.currentTarget.checked)}
          aria-describedby="theme-storage-description"
          data-testid="input-remember-theme"
        />
        <span>Remember theme on this device</span>
      </label>
      <span id="theme-storage-description" className="sr-only">
        When enabled, your appearance choice is saved in this browser. Turn it off to delete the saved choice and stop saving future theme changes.
      </span>
    </div>
  );
}
