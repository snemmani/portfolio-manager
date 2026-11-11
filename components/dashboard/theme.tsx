'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Theme: dark (default), light or follow the system. Stored per browser. */
export default function ThemeSelector() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('arthapalana-theme');
      if (['system', 'light', 'dark'].includes(saved || '')) setTheme(saved!);
    } catch {}
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem('arthapalana-theme', theme);
    } catch {}
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return (
    <div role="group" aria-label="Colour theme" className="inline-flex h-7 items-center rounded-md border border-line bg-panel p-0.5">
      {(
        [
          ['light', Sun, 'Light theme'],
          ['system', Monitor, 'System theme'],
          ['dark', Moon, 'Dark theme'],
        ] as const
      ).map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={cn('grid h-6 w-6 place-items-center rounded-[4px] text-muted-foreground hover:text-foreground', theme === value && 'bg-raised text-foreground')}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
