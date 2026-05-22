import { sanitizeRichText, stripAllTags } from './sanitize-rich-text';

describe('sanitizeRichText', () => {
  it('zachová základní formátování', () => {
    const html =
      '<p><strong>tučně</strong> <em>kurzíva</em> <s>přeškrtnuté</s> <u>podtržené</u></p>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('zahodí <script> a on* atributy', () => {
    expect(sanitizeRichText('<p onclick="evil()">x</p>')).toBe('<p>x</p>');
    expect(sanitizeRichText('<script>alert(1)</script><p>ok</p>')).toBe(
      '<p>ok</p>',
    );
  });

  it('krok 8.2 — povolí <sup> a <sub>', () => {
    const html = '<p>E = mc<sup>2</sup> a H<sub>2</sub>O</p>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('krok 8.2 — povolí barvu textu ve span style', () => {
    const hex = '<p><span style="color:#ff0000">červená</span></p>';
    expect(sanitizeRichText(hex)).toContain('color:#ff0000');

    const rgb = '<p><span style="color:rgb(0, 128, 255)">modrá</span></p>';
    expect(sanitizeRichText(rgb)).toContain('rgb(0, 128, 255)');
  });

  it('krok 8.2 — zahodí jiné inline styly než color', () => {
    const html =
      '<p><span style="color:#fff;position:fixed;display:none">x</span></p>';
    const out = sanitizeRichText(html);
    expect(out).toContain('color:#fff');
    expect(out).not.toContain('position');
    expect(out).not.toContain('display');
  });

  it('zachová odkazy, externí dostane rel + target', () => {
    const out = sanitizeRichText('<p><a href="https://x.com">ext</a></p>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it('prázdný vstup → prázdný výstup', () => {
    expect(sanitizeRichText('')).toBe('');
  });
});

describe('stripAllTags', () => {
  it('odstraní veškeré HTML', () => {
    expect(stripAllTags('<p><strong>text</strong></p>')).toBe('text');
  });
});
