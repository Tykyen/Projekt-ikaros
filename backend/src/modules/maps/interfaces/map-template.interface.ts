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
  config: HexConfig;
  npcTemplates: MapSceneNpc[];
  tokens: MapToken[];
  effects: MapEffect[];
  fogEnabled: boolean;
  revealedHexes: HexCoord[];
  activeSoundIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
