import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../common/utils/mixed-array.schema';

/**
 * 16.2g F2 — verzované per-svět schéma entit taktické mapy (bestie/token)
 * pro „Vlastní Systém". Analogické `diary_schema_versions` (deník), ale drží
 * `SystemEntitySchema.sections` (bohatší tvar s `combatBehavior`) a klíčuje
 * navíc `entityType`, protože jeden svět má vlastní schéma pro bestii i token.
 */
export type EntitySchemaVersionDocument =
  HydratedDocument<EntitySchemaVersionSchemaClass>;

@Schema({ timestamps: false, collection: 'entity_schema_versions' })
export class EntitySchemaVersionSchemaClass {
  @Prop({ required: true }) worldId: string;
  /** 'bestie' | 'token' */
  @Prop({ required: true }) entityType: string;
  @Prop({ required: true, min: 1 }) version: number;
  @Prop({ required: true }) system: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  sections: Record<string, unknown>[];
  @Prop({ type: Date, default: null }) archivedAt: Date | null;
}

export const EntitySchemaVersionSchema = SchemaFactory.createForClass(
  EntitySchemaVersionSchemaClass,
);
EntitySchemaVersionSchema.index(
  { worldId: 1, entityType: 1, version: 1 },
  { unique: true },
);
EntitySchemaVersionSchema.index({ worldId: 1, entityType: 1, version: -1 });
