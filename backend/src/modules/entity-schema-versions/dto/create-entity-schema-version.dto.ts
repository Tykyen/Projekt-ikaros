import {
  IsArray,
  IsIn,
  IsObject,
  IsString,
  ArrayMaxSize,
} from 'class-validator';

/** 16.2g F2 — entity typy s per-svět editovatelným schématem. */
export const ENTITY_SCHEMA_TYPES = ['bestie', 'token'] as const;

export class CreateEntitySchemaVersionDto {
  @IsString()
  @IsIn([...ENTITY_SCHEMA_TYPES])
  entityType: string;

  /**
   * `SystemEntitySchema.sections`. Ukládá se jako volný objekt (Mixed) —
   * konzistentně s `diary_schema_versions.schema` a `config`; tvar drží FE
   * (SchemaSection/SchemaField), BE jen skladuje + validuje bestie proti němu.
   */
  @IsArray()
  @ArrayMaxSize(30)
  @IsObject({ each: true })
  sections: Record<string, unknown>[];
}
