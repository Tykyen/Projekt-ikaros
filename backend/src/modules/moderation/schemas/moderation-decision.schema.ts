import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ModerationAction,
  ReportCategory,
  ReportTargetType,
} from '../enums/moderation.enums';

export type ModerationDecisionDocument =
  HydratedDocument<ModerationDecisionSchemaClass>;

/**
 * Spec 20B §„Kolekce moderation_decisions" — statement of reasons (DSA čl. 17).
 * Moderační log, nikdy se nemaže. V B1 se zapisuje jen při resolve; plné využití
 * (napojení na cílové moduly, notifikace, odvolání) je pozdější sub-krok.
 */
@Schema({ collection: 'moderation_decisions' })
export class ModerationDecisionSchemaClass {
  // Volitelné — může být i proaktivní zásah bez reportu.
  @Prop() reportId?: string;

  @Prop({ required: true, enum: ReportTargetType })
  targetType: ReportTargetType;

  @Prop({ required: true }) targetId: string;
  @Prop({ required: true }) targetSnapshot: string;
  @Prop() worldId?: string;

  // Denormalizace z reportu — autor cíle (notifikace + `decisions/mine`) a URL cíle.
  @Prop() targetAuthorId?: string;
  @Prop() targetUrl?: string;

  @Prop({ required: true, enum: ModerationAction }) action: ModerationAction;
  @Prop({ required: true }) reasonText: string;
  @Prop({ enum: ReportCategory }) category?: ReportCategory;
  @Prop({ required: true }) legalOrPolicyGround: string;

  @Prop({ default: false }) automated: boolean;

  @Prop({ required: true }) moderatorId: string;
  @Prop({ required: true }) moderatorName: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;

  @Prop() authorNotifiedAt?: Date;
  @Prop() reporterNotifiedAt?: Date;
  @Prop() appealId?: string;
}

export const ModerationDecisionSchema = SchemaFactory.createForClass(
  ModerationDecisionSchemaClass,
);
ModerationDecisionSchema.index({ targetType: 1, targetId: 1 });
// `decisions/mine` — odůvodnění zásahů vůči konkrétnímu autorovi (nejnovější první).
ModerationDecisionSchema.index({ targetAuthorId: 1, createdAtUtc: -1 });
// Moderační log — chronologický audit (nejnovější první).
ModerationDecisionSchema.index({ createdAtUtc: -1 });
