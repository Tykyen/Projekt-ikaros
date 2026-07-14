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
    | 'pit'
    // 21.3e — město: `empty` je tu volný terén; budovy/hradby jsou pozitiv.
    | 'street'
    | 'building'
    | 'city-wall'
    | 'gate'
    | 'bridge'
    // 21.3g — krajina: `empty` = louka; `street` se renderuje jako cesta.
    | 'forest'
    | 'mountain'
    | 'hill'
    | 'field'
    | 'swamp';
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
  // 21.3c — bez worldId (null) = položka osobní knihovny vlastníka.
  worldId?: string | null;
  // 21.3a — tvůrce podzemí (server-enforced). Legacy dokumenty bez ownerId
  // se chovají jako PJ-owned (edit jen PJ+).
  ownerId?: string;
  name: string;
  // 21.3e+g — druh mapy: podzemí (negativ do skály) / město (pozitiv na
  // terén) / krajina (exteriér). Volí se při založení, nekonvertuje se.
  // Legacy bez pole = dungeon.
  mapKind?: 'dungeon' | 'city' | 'wilderness';
  gridType: 'square' | 'hex';
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  theme: 'dyson' | 'modern';
  cells: DungeonCell[][];
  decorations: DungeonDecoration[];
  // 21.3f — klíč mapy: popisy k popiskům (číslo místnosti/budovy → text pro PJ).
  notes?: DungeonNote[];
  lastModified?: Date;
}

/** 21.3f — položka klíče mapy; `label` = text popisku na mapě (typicky číslo). */
export interface DungeonNote {
  label: string;
  title: string;
  text: string;
}
