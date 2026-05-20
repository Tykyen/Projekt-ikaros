/**
 * Whitelist klíčů per-svět chat fontů + velikostí (6.2f).
 *
 * Zrcadleno na FE v `src/features/world/chat/lib/chatFonts.ts` —
 * CSS font-family stack a CSS rem hodnoty drží FE, BE jen validuje klíče.
 */

export const CHAT_FONT_KEYS = [
  // Systémové
  'system',
  'inter',
  // Knižní a typografie
  'cormorant',
  'lora',
  'playfair',
  'crimson',
  'spectral',
  'ebgaramond',
  'cardo',
  'eczar',
  // Středověké a epické
  'cinzel',
  'cinzeldecorative',
  'medievalsharp',
  'unifraktur',
  'newrocker',
  'pirata',
  // Rukopisy a poznámky
  'caveat',
  'greatvibes',
  'tangerine',
  'italianno',
  'meaculpa',
  'pinyon',
  'imperialscript',
  'allura',
  'sail',
  'macondo',
  // Stroje a terminály
  'mono',
  'jbmono',
  'sharetech',
  'specialelite',
  // Futuristické a cyber
  'orbitron',
  'audiowide',
  'rajdhani',
  'chakrapetch',
  'blackops',
  'bigshoulders',
  'bebas',
  'wallpoet',
] as const;

export type ChatFontKey = (typeof CHAT_FONT_KEYS)[number];

export const CHAT_FONT_SIZE_KEYS = [
  'xs',
  'sm',
  'normal',
  'lg',
  'xl',
  'xxl',
] as const;

export type ChatFontSizeKey = (typeof CHAT_FONT_SIZE_KEYS)[number];
