'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';

export default function ThemeSelector() {
  const [theme, setTheme] = useState('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('arthapalana-theme');
      if (['system', 'light', 'dark'].includes(saved || '')) setTheme(saved!);
    } catch {}
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.style.colorScheme =
        document.documentElement.dataset.theme;
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem('arthapalana-theme', theme);
    } catch {}
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return (
    <div
      className="range-buttons theme-toggle-group"
      role="group"
      aria-label="Color theme"
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      <button
        type="button"
        title="Light theme"
        aria-label="Light theme"
        className={theme === 'light' ? 'selected' : ''}
        onClick={() => setTheme('light')}
        style={{ padding: '4px 7px', display: 'grid', placeItems: 'center' }}
      >
        <Sun size={14} />
      </button>
      <button
        type="button"
        title="System theme"
        aria-label="System theme"
        className={theme === 'system' ? 'selected' : ''}
        onClick={() => setTheme('system')}
        style={{ padding: '4px 7px', display: 'grid', placeItems: 'center' }}
      >
        <Monitor size={14} />
      </button>
      <button
        type="button"
        title="Dark theme"
        aria-label="Dark theme"
        className={theme === 'dark' ? 'selected' : ''}
        onClick={() => setTheme('dark')}
        style={{ padding: '4px 7px', display: 'grid', placeItems: 'center' }}
      >
        <Moon size={14} />
      </button>
    </div>
  );
}
