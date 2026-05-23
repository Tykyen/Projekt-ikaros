import type { PageSection } from '../../pages/interfaces/page.interface';

export interface CustomDiaryBlock {
  id: string;
  type: string;
  label: string;
  description?: string;
  maxValue?: number;
  minValue?: number;
  color?: string;
  options?: string[];
  order: number;
  layoutArea?: string;
}

export interface CharacterDiary {
  id: string;
  characterId: string;
  worldId: string;
  sections: PageSection[];
  personalDiarySchema?: CustomDiaryBlock[];
  customData: Record<string, unknown>;
  /** D-073 (2026-05-23) — optimistic concurrency token. */
  updatedAt?: Date;
}
