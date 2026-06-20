import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type UniverseMapDocument = HydratedDocument<UniverseMapSchemaClass>;

@Schema({ timestamps: true, collection: 'universeMaps' })
export class UniverseMapSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  nodes: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  links: Record<string, unknown>[];
}

export const UniverseMapSchema = SchemaFactory.createForClass(
  UniverseMapSchemaClass,
);
// DI (plný audit 2026-06-20) — index dříve deklarovaný 2×: `@Prop unique` +
// explicitní `.index()` → mongoose „Duplicate schema index" warning. `@Prop`
// unique stačí; explicitní řádek odstraněn (stejný unique index na worldId).
