export interface HexConfig {
  size: number;
  originX: number;
  originY: number;
  showGrid: boolean;
  // 10.2g — per-scéna viditelnost HP barů dle typu tokenu (undefined = true).
  showHpPc?: boolean;
  showHpNpc?: boolean;
  showHpBestie?: boolean;
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
    // 10.2g — diary subdoc customData (per-system HP klíče pro HP bar PC/NPC).
    customData?: Record<string, unknown>;
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
  /**
   * 10.2-prep-1 — per-scene atomic counter pro operations log.
   * Inkrementuje se přes `$inc` při každé `MapOperation` insertu.
   */
  lastSeqNumber?: number;
  /**
   * 10.2-prep-1 — combat tracker subdoc. Plná semantika v spec `combat` (10.2f).
   * `null`/absent = boj není aktivní.
   */
  combat?: Record<string, unknown> | null;
  /**
   * 10.2c-edit-7 — per-scéna whitelist Character.id (PC + NPC).
   * Default `[]`. Spawn z palety probíhá jen z tohoto setu.
   */
  activeCharacterIds: string[];
  /**
   * 10.2c-edit-7 — per-scéna whitelist Bestie.id.
   * Default `[]`. Spawn bestií z palety probíhá jen z tohoto setu.
   */
  activeBestieIds: string[];
}
