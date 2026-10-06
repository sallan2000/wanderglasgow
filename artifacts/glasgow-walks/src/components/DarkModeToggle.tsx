'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';

export function DarkModeToggle() {
  const { theme: externalTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setMounted(true);
    const match = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(match.matches ? 'dark' : 'light');
    return match.addEventListener('change', (e) => setSystemTheme(e.matches ? 'dark' : 'light'));
  }, []);

  const current = externalTheme ?? 'system';

  const cycleTheme = () => {
    if (current === 'light') setTheme('dark');
    else if (current === 'dark') setTheme('system');
    else setTheme('light');
  };

  if (!mounted) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={cycleTheme}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Switch to ${current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light'} mode`}
        title="Toggle dark mode"
      >
        {current === 'light' ? <Moon size={16} /> : current === 'dark' ? <Monitor size={16} /> : <Sun size={16} />}
      </button>
    </div>
  );
}
