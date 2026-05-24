import type { PageSection } from '../../pages/interfaces/page.interface';

export interface CharacterInventory {
  id: string;
  characterId: string;
  isHidden: boolean;
  sections: PageSection[];
  /** 8.1-FIR (2026-05-24) — RichText „Rozepsané" Matrix-style. */
  notes: string;
  /** D-073 (2026-05-23) — optimistic concurrency token. */
  updatedAt?: Date;
}
