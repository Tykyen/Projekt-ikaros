export interface HexConfig {
  size: number;
  originX: number;
  originY: number;
  showGrid: boolean;
}

export interface HexCoord {
  q: number;
  r: number;
}

export interface ExplosionRing {
  radius: number;
  damage: number;
}

export interface MapEffect {
  id: string;
  type: string;
  hexes: HexCoord[];
  color?: string;
  rings?: ExplosionRing[];
  variant?: string;
  excludedHexes?: HexCoord[];
  barrierDC?: number;
}

export interface MapTokenAbility {
  name: string;
  description: string;
}

export interface MapToken {
  id: string;
  characterId: string;
  characterSlug: string;
  q: number;
  r: number;
  isNpc: boolean;
  templateId?: string;
  instanceName?: string;
  currentHp: number;
  maxHp: number;
  baseHp: number;
  armor: number;
  baseArmor: number;
  injury: number;
  initiative: number;
  initiativeBase: number;
  inCombat: boolean;
  movement: number;
  abilities: MapTokenAbility[];
  personalDiarySchema?: Record<string, unknown>[];
  customData: Record<string, unknown>;
  // Doplněno při GET — nikdy se neukládá do DB
  characterData?: {
    name: string;
    imageUrl?: string;
    diaryData: Record<string, unknown>;
  };
}

export interface MapSceneNpc {
  id: string;
  originTemplateId?: string;
  name: string;
  imageUrl?: string;
  notes: string;
  maxHp: number;
  armor: number;
  injury: number;
  movement: number;
  initiativeBase: number;
  abilities: { label: string; value: string }[];
  personalDiarySchema?: Record<string, unknown>[];
  customData: Record<string, unknown>;
}

export interface MapScene {
  id: string;
  worldId: string;
  name: string;
  imageUrl: string;
  folder?: string;
  config: HexConfig;
  tokens: MapToken[];
  npcTemplates: MapSceneNpc[];
  effects: MapEffect[];
  fogEnabled: boolean;
  revealedHexes: HexCoord[];
  templateId?: string;
  isActive: boolean;
  isHidden: boolean;
  isLocked: boolean;
  activeSoundIds: string[];
  lastModified?: Date;
}
