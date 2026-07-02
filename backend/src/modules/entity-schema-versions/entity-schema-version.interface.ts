import type { SchemaSection } from '../maps/schemas/system-entity-schema/system-entity-schema.types';

export interface EntitySchemaVersion {
  id: string;
  worldId: string;
  /** 'bestie' | 'token' */
  entityType: string;
  version: number;
  system: string;
  sections: SchemaSection[];
  archivedAt: Date | null;
}

export interface EntitySchemaVersionMeta {
  entityType: string;
  version: number;
  system: string;
  archivedAt: Date | null;
}
