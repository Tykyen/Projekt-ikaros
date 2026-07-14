export interface DungeonWallEdges {
  // square grid
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
  // hex grid (volitelné)
  nw?: boolean;
  n?: boolean;
  ne?: boolean;
  se?: boolean;
  s?: boolean;
  sw?: boolean;
}

export interface DungeonCell {
  type:
    | 'empty'
    | 'floor'
    | 'wall'
    | 'door'
    | 'door-locked'
    // 21.3a — donjon legenda: průchod / tajné dveře / dveře s pastí / padací mříž
    | 'archway'
    | 'door-secret'
    | 'door-trapped'
    | 'portcullis'
    | 'stairs-up'
    | 'stairs-down'
    | 'water'
    | 'lava'
    | 'pit';
  // 21.3a — volitelné: editor zdi odvozuje z hranice podlaha↔skála, hrany
  // se používají jen u speciálních tvarů (výhled). Šetří ~5× payload.
  wallEdges?: DungeonWallEdges;
  floorVariant?: string;
}

export interface DungeonDecoration {
  id: string;
  type: string;
  cellX: number;
  cellY: number;
  rotation: 0 | 90 | 180 | 270;
  // 21.3a — textový popisek (čísla/názvy místností); používá type 'label'.
  label?: string;
}

export interface DungeonMap {
  id: string;
  worldId: string;
  // 21.3a — tvůrce podzemí (server-enforced). Legacy dokumenty bez ownerId
  // se chovají jako PJ-owned (edit jen PJ+).
  ownerId?: string;
  name: string;
  gridType: 'square' | 'hex';
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  theme: 'dyson' | 'modern';
  cells: DungeonCell[][];
  decorations: DungeonDecoration[];
  lastModified?: Date;
}
