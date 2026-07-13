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
  /**
   * D-066 (spec 20B B4b) — moderační skrytí deníku (M2/M3). Skrytý deník vidí
   * jen platform reviewer set (vzor pages) — vlastník i PJ dostanou 404.
   */
  moderationHidden?: boolean;
  moderationHiddenReason?: string;
  /** D-073 (2026-05-23) — optimistic concurrency token. */
  updatedAt?: Date;
}
