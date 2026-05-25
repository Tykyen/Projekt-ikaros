import { escapeRegex } from './escape-regex';

describe('escapeRegex', () => {
  it('escape všechny Mongo/regex special chars', () => {
    expect(escapeRegex('.')).toBe('\\.');
    expect(escapeRegex('*')).toBe('\\*');
    expect(escapeRegex('+')).toBe('\\+');
    expect(escapeRegex('?')).toBe('\\?');
    expect(escapeRegex('^')).toBe('\\^');
    expect(escapeRegex('$')).toBe('\\$');
    expect(escapeRegex('(')).toBe('\\(');
    expect(escapeRegex(')')).toBe('\\)');
    expect(escapeRegex('|')).toBe('\\|');
    expect(escapeRegex('[')).toBe('\\[');
    expect(escapeRegex(']')).toBe('\\]');
    expect(escapeRegex('{')).toBe('\\{');
    expect(escapeRegex('}')).toBe('\\}');
    expect(escapeRegex('\\')).toBe('\\\\');
  });

  it('nemění obyčejné znaky', () => {
    expect(escapeRegex('abc123 ěščř')).toBe('abc123 ěščř');
  });

  it('DoS pattern .* je neškodný po escape', () => {
    expect(escapeRegex('.*')).toBe('\\.\\*');
  });

  it('kombinace běžného textu + special chars', () => {
    expect(escapeRegex('Bitva (1453) — Jan Žižka.')).toBe(
      'Bitva \\(1453\\) — Jan Žižka\\.',
    );
  });

  it('prázdný string', () => {
    expect(escapeRegex('')).toBe('');
  });
});
