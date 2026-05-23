import type {
  DiarySchemaVersion,
  DiarySchemaVersionMeta,
} from './diary-schema-version.interface';

export interface IDiarySchemaVersionsRepository {
  findMetaByWorldId(worldId: string): Promise<DiarySchemaVersionMeta[]>;
  findByWorldIdAndVersion(
    worldId: string,
    version: number,
  ): Promise<DiarySchemaVersion | null>;
  findLastVersion(worldId: string): Promise<number>;
  findActive(worldId: string): Promise<DiarySchemaVersion | null>;
  create(data: Omit<DiarySchemaVersion, 'id'>): Promise<DiarySchemaVersion>;
  archive(worldId: string, version: number): Promise<void>;
}
