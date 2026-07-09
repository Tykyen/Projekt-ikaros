import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { ModerationAppealStatus } from '../interfaces/moderation-entities.interface';

export type ModerationAppealDocument =
  HydratedDocument<ModerationAppealSchemaClass>;

/**
 * Spec 20B §„Kolekce moderation_appeals" — odvolání (DSA čl. 20).
 * V B1 vytváříme jen schéma + repo; endpointy odvolání/přezkumu jsou pozdější
 * sub-krok. Invariant `reviewerId != decision.moderatorId` se vynutí až tam.
 */
@Schema({ collection: 'moderation_appeals' })
export class ModerationAppealSchemaClass {
  @Prop({ required: true }) decisionId: string;
  @Prop({ required: true }) appellantId: string;
  @Prop({ required: true }) appellantName: string;
  @Prop({ required: true, maxlength: 2000 }) reason: string;

  @Prop({ default: 'pending', enum: ['pending', 'upheld', 'overturned'] })
  status: ModerationAppealStatus;

  @Prop() reviewerId?: string;
  @Prop() reviewerNote?: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop() resolvedAtUtc?: Date;
}

export const ModerationAppealSchema = SchemaFactory.createForClass(
  ModerationAppealSchemaClass,
);
