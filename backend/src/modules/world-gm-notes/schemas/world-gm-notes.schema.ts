import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldGmNotesDocument = HydratedDocument<WorldGmNotesSchemaClass>;

/**
 * 10.2j — PJ poznámky na svět. Per-PJ (compound unique {worldId, userId}),
 * takže víc PJ ve světě si navzájem nepřepisuje obsah. `timestamps` pro
 * optimistic concurrency.
 */
@Schema({ timestamps: true, collection: 'world_gm_notes' })
export class WorldGmNotesSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) userId: string;
  @Prop({ default: '' }) content: string;
}

export const WorldGmNotesSchema = SchemaFactory.createForClass(
  WorldGmNotesSchemaClass,
);
WorldGmNotesSchema.index({ worldId: 1, userId: 1 }, { unique: true });
