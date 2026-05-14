import type {
  HexConfig,
  MapToken,
  MapSceneNpc,
  MapEffect,
  HexCoord,
} from './map-scene.interface';

export interface MapTemplate {
  id: string;
  name: string;
  imageUrl: string;
  config: HexConfig;
  npcTemplates: MapSceneNpc[];
  tokens: MapToken[];
  effects: MapEffect[];
  fogEnabled: boolean;
  revealedHexes: HexCoord[];
  activeSoundIds: string[];
  lastModified?: Date;
}
