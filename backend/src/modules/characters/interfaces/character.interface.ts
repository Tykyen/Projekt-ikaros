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
}

export interface CharacterDirectoryEntry {
  id: string;
  slug: string;
  name: string;
  isNpc: boolean;
}

export interface Character {
  id: string;
  slug: string;
  name: string;
  worldId: string;
  /** PC má `userId` (hráč postavy); NPC nemá. */
  userId?: string;
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
}
