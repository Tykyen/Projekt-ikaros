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
  type: 'empty' | 'floor' | 'wall' | 'door' | 'door-locked'
      | 'stairs-up' | 'stairs-down' | 'water' | 'lava' | 'pit';
  wallEdges: DungeonWallEdges;
  floorVariant?: string;
}

export interface DungeonDecoration {
  id: string;
  type: string;
  cellX: number;
  cellY: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface DungeonMap {
  id: string;
  worldId: string;
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
