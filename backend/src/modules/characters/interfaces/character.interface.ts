/**
 * Krok 9.1 (cleanup) — Character entity je po sjednocení Character → Page
 * kontejner JEN pro 5 subdokumentů (diary/calendar/finance/inventory/notes).
 * Bio data (publicBio, publicInfoBlocks, privateBio, privateInfoBlocks,
 * imageUrl, accessRequirements, isLocation) jsou nyní kanonicky v Page
 * entity přes `Page.characterRef.characterId`.
 *
 * Skript `cleanup-character-duplicates-9.1` smazal duplicitní pole
 * z `characters` collection.
 */

export interface InfoBlock {
  label: string;
  value: string;
}

export type TagValue = InfoBlock; // { label: string; value: string }

export interface SchemaBlock {
  key: string;
  label: string;
  type: string;
  config?: Record<string, unknown>;
  order: number;
}

export interface PlayerCharacter {
  id: string;
  name: string;
  slug: string;
  isNpc: boolean;
  /** undefined = volná PC postava bez ownera (PJ ji vytvořil, hráč může být přiřazen později). */
  userId?: string;
  /** 10.2g — obrázek z Page (po sjednocení 9.1) pro avatar ve spawn paletě. */
  imageUrl?: string;
}

export interface CharacterDirectoryEntry {
  id: string;
  slug: string;
  name: string;
  isNpc: boolean;
  /** Spec 9.2 — 'location' (Lokace) / 'persona'. Pro filtraci Lokace z výběru postav. */
  kind: 'persona' | 'location';
  /** Obrázek postavy (z Page) — pro avatar člena po přiřazení. */
  imageUrl?: string;
}

export interface Character {
  id: string;
  slug: string;
  name: string;
  worldId: string;
  /**
   * PC má `userId` (hráč postavy); NPC nemá.
   * FIX-5 — `null` (ne jen `undefined`) musí být typově přípustné: Mongoose
   * `$set` s `undefined` klíčem hodnotu NEZMĚNÍ (stará zůstane), `null` se
   * zapíše a skutečně odpojí vlastníka (`convert` CP→NPC).
   */
  userId?: string | null;
  isNpc: boolean;
  /**
   * Spec 9.2 — `'persona'` = PostavaHrace/NPC (default, plné subdocs),
   * `'location'` = Lokace (jen calendar subdoc, ignore `isNpc`).
   */
  kind: 'persona' | 'location';

  // Subdoc data — deník schema + payload, custom block bag
  diaryData: Record<string, unknown>;
  extraBlocks: SchemaBlock[];

  // Společné
  campaignSubjectId?: string;
  customData?: Record<string, unknown>;
  /**
   * 9.2c — preferovaný kalendář pro events této postavy/NPC/lokace.
   * Fallback na `World.defaultCalendarConfigSlug` pokud null.
   */
  preferredCalendarConfigId?: string | null;
  createdAt: Date;
  /** D-073 (2026-05-23) — optimistic concurrency token. */
  updatedAt?: Date;
}

/**
 * Veřejný náhled postavy — bio data jdou z Page entity, nezveřejňujeme
 * subdoc data ani customData. Použito ve výpisech pro neoprávněné.
 */
export interface CharacterPublicView {
  id: string;
  slug: string;
  name: string;
  worldId: string;
  isNpc: boolean;
  /** 10.2g — obrázek z Page (po sjednocení 9.1) pro avatar ve spawn paletě. */
  imageUrl?: string;
}
