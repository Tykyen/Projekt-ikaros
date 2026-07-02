import type {
  EntitySchemaVersion,
  EntitySchemaVersionMeta,
} from './entity-schema-version.interface';

export interface IEntitySchemaVersionsRepository {
  findMetaByWorld(
    worldId: string,
    entityType: string,
  ): Promise<EntitySchemaVersionMeta[]>;
  findByWorldEntityVersion(
    worldId: string,
    entityType: string,
    version: number,
  ): Promise<EntitySchemaVersion | null>;
  findLastVersion(worldId: string, entityType: string): Promise<number>;
  findActive(
    worldId: string,
    entityType: string,
  ): Promise<EntitySchemaVersion | null>;
  create(data: Omit<EntitySchemaVersion, 'id'>): Promise<EntitySchemaVersion>;
  archive(worldId: string, entityType: string, version: number): Promise<void>;
}
