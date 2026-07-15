import type {
  HexConfig,
  MapToken,
  MapSceneNpc,
  MapEffect,
  HexCoord,
} from './map-scene.interface';

export interface MapTemplate {
  id: string;
  /**
   * 10.2c-edit-2 — per-PJ vlastnictví. Server-side enforced (POST přepisuje
   * z auth user, PUT zachovává původní, klient z body ignorovat).
   */
  ownerId: string;
  name: string;
  imageUrl: string;
  /** D-19.2 — velikost blobu `imageUrl` v bytech; staré dokumenty nemají. */
  imageBytes?: number;
  config: HexConfig;
  npcTemplates: MapSceneNpc[];
  tokens: MapToken[];
  effects: MapEffect[];
  fogEnabled: boolean;
  revealedHexes: HexCoord[];
  activeSoundIds: string[];
  // ── 22.5 — publikace do veřejného katalogu ──
  published?: boolean;
  publishedAt?: Date | null;
  authorId?: string | null;
  publicAuthorName?: string | null;
  reviewStatus?: 'pending' | 'approved' | 'rejected' | null;
  moderationHidden?: boolean;
  moderationHiddenReason?: string | null;
  licenseId?: string | null;
  clonedFromTemplateId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
