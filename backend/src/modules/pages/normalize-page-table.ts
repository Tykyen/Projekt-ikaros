import type { PageTable } from './interfaces/page.interface';

/**
 * Krok 8.5 — normalizace `PageTable` při čtení z DB (`toEntity` mapper).
 *
 * Buňka tabulky (klíč i hodnota) je rich-text HTML string. Mapper sjednotí
 * tři historické tvary na HTML string:
 *  1. starý Matrix / krok 8.5: `string` s HTML (`<a href="slug">…</a>`)
 *  2. krok 7.2: `string` prostý text
 *  3. krok 8.4: `{ text, link }` objekt → převedeno na `<a>` HTML
 *
 * Lazy migrace — dokument se přepíše do tvaru (1) až při dalším uložení.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeCell(raw: unknown): string {
  // Tvar (3) — krok 8.4 objekt `{ text, link }`.
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as { text?: unknown; link?: unknown };
    const text = typeof obj.text === 'string' ? obj.text : '';
    const link = typeof obj.link === 'string' ? obj.link.trim() : '';
    if (!link) return escapeHtml(text);
    return `<a href="${escapeHtml(link)}">${escapeHtml(text || link)}</a>`;
  }

  // Tvar (1) / (2) — string (HTML i prostý text projdou beze změny;
  // sanitizaci HTML řeší service při uložení).
  return typeof raw === 'string' ? raw : '';
}

export function normalizePageTable(raw: unknown): PageTable | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const t = raw as {
    hasTable?: unknown;
    title?: unknown;
    headers?: unknown;
    values?: unknown;
  };
  return {
    hasTable: t.hasTable === true,
    ...(typeof t.title === 'string' ? { title: t.title } : {}),
    ...(Array.isArray(t.headers)
      ? { headers: t.headers.map((h) => normalizeCell(h)) }
      : {}),
    ...(Array.isArray(t.values)
      ? { values: t.values.map((v) => normalizeCell(v)) }
      : {}),
  };
}
