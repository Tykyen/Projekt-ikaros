import { normalizeCell, normalizePageTable } from './normalize-page-table';

describe('normalizeCell (8.5 — buňka = HTML string)', () => {
  it('prostý string ponechá beze změny', () => {
    expect(normalizeCell('Aralion')).toBe('Aralion');
  });

  it('HTML string (starý Matrix / 8.5) ponechá beze změny', () => {
    const html = '<a href="aralion">Hlavní město</a>';
    expect(normalizeCell(html)).toBe(html);
  });

  it('krok 8.4 objekt { text, link } → <a> HTML', () => {
    expect(normalizeCell({ text: 'Aralion', link: 'aralion' })).toBe(
      '<a href="aralion">Aralion</a>',
    );
  });

  it('krok 8.4 objekt { text } bez link → escapovaný text', () => {
    expect(normalizeCell({ text: '5 mil.' })).toBe('5 mil.');
  });

  it('objekt { text, link } escapuje uvozovky a závorky', () => {
    expect(normalizeCell({ text: 'a<b', link: 'x"y' })).toBe(
      '<a href="x&quot;y">a&lt;b</a>',
    );
  });

  it('objekt s prázdným link → jen escapovaný text', () => {
    expect(normalizeCell({ text: 'x', link: '  ' })).toBe('x');
  });

  it('null / číslo / undefined → prázdný string', () => {
    expect(normalizeCell(null)).toBe('');
    expect(normalizeCell(undefined)).toBe('');
    expect(normalizeCell(42)).toBe('');
  });
});

describe('normalizePageTable', () => {
  it('undefined / null → undefined', () => {
    expect(normalizePageTable(undefined)).toBeUndefined();
    expect(normalizePageTable(null)).toBeUndefined();
  });

  it('starý tvar values:string[] → string[] beze změny', () => {
    const result = normalizePageTable({
      hasTable: true,
      title: 'Profil',
      headers: ['Město', 'Měna'],
      values: ['Aralion', '<a href="zlato">Zlaťák</a>'],
    });
    expect(result).toEqual({
      hasTable: true,
      title: 'Profil',
      headers: ['Město', 'Měna'],
      values: ['Aralion', '<a href="zlato">Zlaťák</a>'],
    });
  });

  it('krok 8.4 values:{text,link}[] → HTML string[]', () => {
    const result = normalizePageTable({
      hasTable: true,
      headers: ['Hl. město'],
      values: [{ text: 'Aralion', link: 'aralion' }],
    });
    expect(result).toEqual({
      hasTable: true,
      headers: ['Hl. město'],
      values: ['<a href="aralion">Aralion</a>'],
    });
  });

  it('hasTable jiné než true → false', () => {
    expect(normalizePageTable({})?.hasTable).toBe(false);
  });
});
