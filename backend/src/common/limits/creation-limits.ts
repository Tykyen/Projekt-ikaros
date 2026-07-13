import { ConflictException } from '@nestjs/common';

/**
 * D-SEC-GAP-2026-07-11 — anti-abuse creation-flood.
 *
 * Rate-limit (@Throttle) brzdí requesty, ale trpělivý účet může postupně
 * navršit tisíce entit → DB/storage bloat. Tohle jsou VELKORYSÉ kumulativní
 * stropy — legitimní hráč je nikdy nepotká, abuse zastaví.
 *
 * Konfigurace: env proměnná stejného jména jako klíč (např.
 * `MAX_WORLDS_PER_USER=100`) přepíše default BEZ rebuildu — čte se lazy při
 * každém checku (env se načítá až za importem modulů, import-time konstanta
 * by .env minula). countDocuments s indexovaným filtrem = O(log n), žádné
 * agregace.
 */
const CREATION_LIMIT_DEFAULTS = {
  /** Světy vlastněné jedním účtem (vč. soft-deleted — bloat je bloat). */
  MAX_WORLDS_PER_USER: 50,
  /** Stránky per svět; Pages+Characters sjednoceny → jeden strop pro oba. */
  MAX_PAGES_PER_WORLD: 2000,
  /** Bestie scope=world per svět. */
  MAX_BESTIAE_PER_WORLD: 1000,
  /** Bestie scope=user per účet. */
  MAX_BESTIAE_PER_USER: 1000,
  /** Chat skupiny (BE ChatGroup, FE „kanál") per svět. */
  MAX_CHAT_GROUPS_PER_WORLD: 200,
  /** Chat konverzace (BE ChatChannel) per svět — ruční tvorba PJ. */
  MAX_CHAT_CHANNELS_PER_WORLD: 500,
  /** Kalendáře per svět. */
  MAX_CALENDARS_PER_WORLD: 50,
  /** Mapy atlasu (world-maps) per svět. */
  MAX_WORLD_MAPS_PER_WORLD: 500,
  /** Aktivní (pending) naplánované zprávy per svět. */
  MAX_SCHEDULED_MESSAGES_PER_WORLD: 200,
  /** Nábory (LFG lístky) per účet. */
  MAX_NABORY_PER_USER: 20,
  /** Články per účet. */
  MAX_ARTICLES_PER_USER: 200,
  /** Galerie obrázky per účet. */
  MAX_GALLERY_ITEMS_PER_USER: 500,
  /** Diskuze per účet. */
  MAX_DISCUSSIONS_PER_USER: 200,
} as const;

export type CreationLimitKey = keyof typeof CREATION_LIMIT_DEFAULTS;

/** Efektivní limit: kladné celé číslo z env, jinak default. */
export function creationLimit(key: CreationLimitKey): number {
  const raw = process.env[key];
  if (raw !== undefined && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return CREATION_LIMIT_DEFAULTS[key];
}

/**
 * Guard: `current` už dosáhl stropu → 409 `LIMIT_REACHED` s vlídnou hláškou
 * (friendly-messaging). `subject` je 2. pád množného čísla („světů na účet",
 * „stránek ve světě").
 */
export function assertUnderCreationLimit(
  current: number,
  key: CreationLimitKey,
  subject: string,
): void {
  const limit = creationLimit(key);
  if (current < limit) return;
  throw new ConflictException({
    code: 'LIMIT_REACHED',
    message: `Dosažen limit počtu ${subject} (${limit}). Pokud potřebuješ víc, ozvi se správci platformy.`,
  });
}
