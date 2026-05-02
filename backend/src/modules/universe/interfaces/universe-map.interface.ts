export type UniverseNodeType = 'planet' | 'star' | 'nebula' | 'asteroid' | 'moon' | 'blackhole';

export interface UniverseNode {
  id: string;
  name: string;
  type?: UniverseNodeType;
  color: string;
  size: number;
  img?: string;
  alliance?: string;
  x?: number;
  y?: number;
  z?: number;
  isPublic: boolean;
  visibleToPlayerIds: string[];
}

export interface UniverseLink {
  source: string;
  target: string;
  isOrbit: boolean;
}

export interface UniverseMap {
  id: string;
  worldId: string;
  nodes: UniverseNode[];
  links: UniverseLink[];
  createdAt: Date;
  updatedAt: Date;
}
