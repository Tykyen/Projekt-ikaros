import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface DiarySchemaVersion {
  id: string;
  worldId: string;
  version: number;
  system: string;
  schema: SchemaBlock[];
  archivedAt: Date | null;
}

export interface DiarySchemaVersionMeta {
  version: number;
  system: string;
  archivedAt: Date | null;
}
