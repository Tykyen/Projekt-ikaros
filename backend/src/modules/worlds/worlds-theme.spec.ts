import { sanitizeThemeOverrides } from './worlds.service';

describe('sanitizeThemeOverrides (krok 5.0)', () => {
  it('propustí validní --theme-* klíče se string hodnotou', () => {
    const out = sanitizeThemeOverrides({
      '--theme-accent': '#c86dff',
      '--theme-surface': 'rgba(0,0,0,0.5)',
    });
    expect(out).toEqual({
      '--theme-accent': '#c86dff',
      '--theme-surface': 'rgba(0,0,0,0.5)',
    });
  });

  it('zahodí klíče bez prefixu --theme-', () => {
    const out = sanitizeThemeOverrides({
      '--theme-accent': '#fff',
      '--evil-token': 'red',
      color: 'red',
      '--mx-hack': 'x',
    });
    expect(out).toEqual({ '--theme-accent': '#fff' });
  });

  it('zahodí ne-string hodnoty a příliš dlouhé hodnoty', () => {
    const out = sanitizeThemeOverrides({
      '--theme-a': 123,
      '--theme-b': { x: 1 },
      '--theme-c': 'x'.repeat(201),
      '--theme-d': 'ok',
    });
    expect(out).toEqual({ '--theme-d': 'ok' });
  });

  it('omezí počet položek na 60', () => {
    const raw: Record<string, string> = {};
    for (let i = 0; i < 100; i++) raw[`--theme-t${i}`] = 'v';
    const out = sanitizeThemeOverrides(raw);
    expect(Object.keys(out)).toHaveLength(60);
  });

  it('prázdný vstup → prázdný výstup', () => {
    expect(sanitizeThemeOverrides({})).toEqual({});
  });
});
