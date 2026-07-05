export interface HexConfig {
  // 15.2 — typ mřížky (hex/square/none); undefined = hex (BC).
  gridType?: 'hex' | 'square' | 'none';
  size: number;
  originX: number;
  originY: number;
  showGrid: boolean;
  // 10.2g — per-scéna viditelnost HP barů dle typu tokenu (undefined = true).
  showHpPc?: boolean;
  showHpNpc?: boolean;
  showHpBestie?: boolean;
  // 15.3 — měřítko (stupnice + pravítko). undefined = 1 / 'm' / true.
  unitsPerCell?: number;
  unitLabel?: string;
  showScale?: boolean;
  // 15.4 — smí hráč kreslit anotace na této scéně? undefined = false.
  allowPlayerDrawing?: boolean;
  // 17.1 — zdroj mlhy: 'manual' (ruční štětec, BC) | 'dynamic' (auto LoS ze zdí).
  visionMode?: 'manual' | 'dynamic';
  // 17.1 — temná scéna: token vidí jen do dosvitu/světel. undefined = false.
  darkness?: boolean;
  // 17.1 — dosvit tokenu v buňkách (jen darkness).
  visionRange?: number;
}

/**
 * 15.4 — anotace (kresba) na mapě. `points` = map-space px páry
 * `[x0,y0,x1,y1,...]`. `visibility`: `pj` = jen PJ, `all` = všichni.
 */
export interface MapDrawing {
  id: string;
  kind: 'line' | 'arrow' | 'circle' | 'text';
  points: number[];
  color: string;
  text?: string;
  createdByUserId: string;
  visibility: 'pj' | 'all';
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

/**
 * 17.2 — zeď/dveře na scéně (import UVTT). `points` = map-space px páry
 * `[x0,y0,x1,y1,...]`. `blocksSight` čte 17.1 (LoS). Mirror FE `MapWall`.
 */
export interface MapWall {
  id: string;
  points: number[];
  type: 'wall' | 'door';
  door?: {
    open: boolean;
    locked?: boolean;
  };
  blocksSight: boolean;
  blocksMovement?: boolean;
}

/**
 * 17.2 — bodový zdroj světla (import UVTT). Souřadnice a `range` v map-space
 * px. Render řeší 17.1. Mirror FE `MapLight`.
 */
export interface MapLight {
  id: string;
  x: number;
  y: number;
  range: number;
  intensity: number;
  color: string;
  shadows?: boolean;
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
  // Per-instance poznámky tokenu (bestie). Snapshot z bestie.notes při spawnu,
  // dál editovatelné nezávisle na šabloně. Write přes token.update {notes}.
  notes?: string;
  // 10.2d-prep-A — per-system staty token instance (schema-driven storage).
  // Klíče = dot-path (`health.current`, `armor`, …). Authoritativní zdroj HP
  // bestie (FE HP bar i panel čtou odtud). Read-mapper `toToken` ho musí
  // propustit, jinak GET HP zahodí — viz repository komentář.
  systemStats?: Record<string, unknown>;
  personalDiarySchema?: Record<string, unknown>[];
  customData: Record<string, unknown>;
  // D-066 — per-token lock (PJ-only). Zamčený token hráč nemůže táhnout,
  // nezávisle na scene.isLocked / playerStates. PJ-only přes authorizer whitelist.
  isLocked?: boolean;
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

/**
 * 10.2n — per-hráč override skrytí/zámku. Efektivní stav hráče = override ??
 * scéna-default (`isHidden`/`isLocked`). Pole je `undefined` = bez overrides.
 */
export interface ScenePlayerState {
  userId: string;
  isHidden?: boolean;
  isLocked?: boolean;
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
  /** 15.4 — anotace (kresby) na scéně. Repo vždy vrací `[]` (read-time). */
  drawings?: MapDrawing[];
  /** 17.2 — zdi/dveře (import UVTT; „spící data" pro 17.1 LoS). */
  walls?: MapWall[];
  /** 17.2 — zdroje světla (import UVTT; render až 17.1). */
  lights?: MapLight[];
  fogEnabled: boolean;
  revealedHexes: HexCoord[];
  templateId?: string;
  isActive: boolean;
  isHidden: boolean;
  isLocked: boolean;
  /** 10.2n — per-hráč override skrytí/zámku (viz `ScenePlayerState`). */
  playerStates: ScenePlayerState[];
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
  /**
   * 10.2j — persistovaná historie hodů scény (cap 50). Tvar `MapDiceRoll`
   * (byUserId, rollerName, rollerKind, category, dicePayload, rolledAt, tokenId?).
   */
  diceRolls?: Record<string, unknown>[];
}
