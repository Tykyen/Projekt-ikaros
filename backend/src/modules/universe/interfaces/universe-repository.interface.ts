import type { UniverseMap, UniverseNode, UniverseLink } from './universe-map.interface';

export interface IUniverseRepository {
  findByWorld(worldId: string): Promise<UniverseMap | null>;
  upsert(worldId: string, nodes: UniverseNode[], links: UniverseLink[]): Promise<UniverseMap>;
  updateNodeVisibility(
    worldId: string,
    nodeId: string,
    isPublic: boolean,
    visibleToPlayerIds: string[],
  ): Promise<UniverseMap | null>;
}
