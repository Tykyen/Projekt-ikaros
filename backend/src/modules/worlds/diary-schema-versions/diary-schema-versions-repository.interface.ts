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
  create(data: Omit<DiarySchemaVersion, 'id'>): Promise<DiarySchemaVersion>;
}
