import { TipTapExtractor } from './tiptap-extractor.service';

describe('TipTapExtractor', () => {
  let extractor: TipTapExtractor;

  beforeEach(() => {
    extractor = new TipTapExtractor();
  });

  it('odstraní HTML tagy a vrátí čistý text', () => {
    const result = extractor.extract('<p>Agent byl v <strong>Tokiu</strong></p>');
    expect(result).toBe('Agent byl v Tokiu');
  });

  it('sloučí vícenásobné mezery', () => {
    const result = extractor.extract('<p>Slovo</p><p>Druhé</p>');
    expect(result).toBe('Slovo Druhé');
  });

  it('vrátí prázdný string pro prázdný vstup', () => {
    expect(extractor.extract('')).toBe('');
  });

  it('vrátí prázdný string pro vstup jen s tagy', () => {
    expect(extractor.extract('<p></p><br/>')).toBe('');
  });
});
