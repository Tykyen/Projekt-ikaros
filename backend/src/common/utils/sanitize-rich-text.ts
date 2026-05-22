import sanitizeHtml from 'sanitize-html';

/**
 * D-NEW-html-sanitization (2026-05-21) — Server-side sanitizace HTML obsahu
 * z TipTap RichTextEditoru. Allowlist matchuje TipTap schema:
 * - paragraf, headingy h2/h3, blockquote
 * - bold/italic/strike/underline
 * - superscript/subscript (krok 8.2 — `<sup>`/`<sub>`)
 * - barva textu (krok 8.2 — `<span style="color: …">` z TipTap Color extension)
 * - bullet/ordered list, listitem
 * - link (jen http/https/mailto, openOnClick=false v editoru)
 * - obrázky (Cloudinary URL, base64 NE — TipTap zakazuje)
 * - tabulky pro 7.2 wiki obsah (table/tr/td/th)
 * - `[[wikilink]]` extension renderuje jako `<a href="<slug>">title</a>` (covered by 'a')
 *
 * Použití: BE service `create` / `update` před save:
 *   const safe = sanitizeRichText(dto.content ?? '');
 *
 * Pokud zmazat HTML úplně (jen plain text), `stripAllTags(html)`.
 */
const RICH_TEXT_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h2',
    'h3',
    'blockquote',
    'strong',
    'em',
    'b',
    'i',
    's',
    'u',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'code',
    'span',
    'sub',
    'sup',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'data-caption'],
    table: ['class'],
    th: ['colspan', 'rowspan', 'colwidth'],
    td: ['colspan', 'rowspan', 'colwidth'],
    // `style` pro barvu textu — hodnoty filtruje `allowedStyles` níže.
    span: ['data-mention', 'style'],
  },
  // Krok 8.2 — TipTap Color extension renderuje `<span style="color: …">`.
  // Povolíme jen CSS property `color` (hex / rgb / rgba / pojmenovaná barva).
  // Ostatní inline styly (position, display, …) sanitizér tiše zahodí.
  allowedStyles: {
    span: {
      color: [
        /^#(0x)?[0-9a-f]{3,8}$/i,
        /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
        /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01]?\.?\d*)\s*\)$/i,
        /^[a-z]+$/i,
      ],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  // Allow relative URLs (wiki slug links: href="<slug>")
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  // Disable filter for href without scheme — wiki slugs jsou bare like `aralion`
  allowProtocolRelative: false,
  // Image src allow data: URL? NE — TipTap má `allowBase64: false`, replikujeme.
  // Cloudinary obrázky jsou full URL https://, projdou skrz `allowedSchemes`.
  transformTags: {
    // a — vždy přidej rel="noopener noreferrer" + target="_blank" pro externí
    a: (tagName, attribs) => {
      const href = attribs.href ?? '';
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName: 'a',
        attribs: {
          ...attribs,
          ...(isExternal && {
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
          }),
        },
      };
    },
  },
};

/**
 * Sanitize TipTap HTML output před uložením do DB. Strikt allowlist —
 * `<script>`, `<style>`, `<iframe>`, on* atributy jsou tiše zahazovány.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, RICH_TEXT_CONFIG);
}

/**
 * Strip all HTML tags, leave only text. Pro plain text extrakci kdy ne TipTap.
 */
export function stripAllTags(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}
