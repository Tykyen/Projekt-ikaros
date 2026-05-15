import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosDiscussionReportDocument =
  HydratedDocument<IkarosDiscussionReportSchemaClass>;

/**
 * Spec 3.4 §4.2 — nahlášený příspěvek diskuze. Konzumuje `DiscussionReportProvider`
 * (queue `discussion_report`). Reporty se nemažou — po vyřízení `resolved: true`
 * (audit stopa). Obsah příspěvku je denormalizovaný snapshot, protože post může
 * být mezitím smazán.
 */
@Schema({ collection: 'ikaros_discussion_reports' })
export class IkarosDiscussionReportSchemaClass {
  @Prop({ required: true }) discussionId: string;
  @Prop({ required: true }) discussionTitle: string;
  @Prop({ required: true }) postId: string;
  @Prop({ required: true }) postContentSnapshot: string;
  @Prop({ required: true }) postAuthorName: string;
  @Prop({ required: true }) reporterId: string;
  @Prop({ required: true }) reporterName: string;
  @Prop({ required: true }) reason: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop({ default: false }) resolved: boolean;
}

export const IkarosDiscussionReportSchema = SchemaFactory.createForClass(
  IkarosDiscussionReportSchemaClass,
);
IkarosDiscussionReportSchema.index({ resolved: 1, createdAtUtc: -1 });
