import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ReportCategory, ReportTargetType } from '../enums/moderation.enums';
import type { ContentReportStatus } from '../interfaces/moderation-entities.interface';

export type ContentReportDocument = HydratedDocument<ContentReportSchemaClass>;

/**
 * Spec 20B §„Kolekce content_reports" — generický report libovolného UGC.
 * Reporty se NEMAŽOU (audit stopa) — po vyřízení `status:'resolved'`.
 *
 * DŮLEŽITÉ (decoupling): snapshot obsahu, targetAuthorName i targetUrl posílá
 * FRONTEND při vytvoření reportu — modul se nesmí vázat na 11 cílových modulů.
 * Server je jen uloží.
 */
@Schema({ collection: 'content_reports' })
export class ContentReportSchemaClass {
  @Prop({ type: String, required: true, enum: ReportTargetType })
  targetType: ReportTargetType;

  @Prop({ required: true }) targetId: string;
  @Prop() targetUrl?: string;
  @Prop() worldId?: string;

  @Prop({ required: true }) targetSnapshot: string;
  @Prop() targetAuthorId?: string;
  @Prop({ required: true }) targetAuthorName: string;

  @Prop({ type: String, required: true, enum: ReportCategory })
  category: ReportCategory;
  @Prop({ required: true, maxlength: 2000 }) reason: string;

  // Reporter identita — volitelná (anonymní CSAM). NIKDY do výstupu při anonymous=true.
  @Prop() reporterId?: string;
  @Prop() reporterName?: string;
  @Prop() reporterEmail?: string;

  @Prop({ default: false }) goodFaith: boolean;
  @Prop() evidence?: string;
  @Prop({ default: false }) notifyMe: boolean;
  @Prop({ default: false }) anonymous: boolean;

  @Prop({
    type: String,
    default: 'pending',
    enum: ['pending', 'triaged', 'resolved'],
  })
  status: ContentReportStatus;

  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop() ackSentAt?: Date;
  @Prop() resolvedByModeratorId?: string;
  @Prop() resolvedAtUtc?: Date;
}

export const ContentReportSchema = SchemaFactory.createForClass(
  ContentReportSchemaClass,
);
ContentReportSchema.index({ status: 1, category: 1, createdAtUtc: -1 });
