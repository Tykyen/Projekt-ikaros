export interface CharacterNotes {
  id: string;
  characterId: string;
  content: string;
  /** D-073 (2026-05-23) — optimistic concurrency token. */
  updatedAt?: Date;
}
