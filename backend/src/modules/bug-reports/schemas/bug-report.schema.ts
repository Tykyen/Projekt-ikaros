import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { BugReportStatus } from '../interfaces/bug-report.interface';

export type BugReportDocument = HydratedDocument<BugReportSchemaClass>;

/**
 * Spec 25.1 — auto-kontext hlášení (posílá FE). Subdokument bez vlastního _id.
 * `url` je bez query stringu (PII/GDPR).
 */
@Schema({ _id: false })
export class BugReportContextSchemaClass {
  @Prop() route?: string;
  @Prop({ required: true }) url: string;
  @Prop({ type: String, required: true, enum: ['ikaros', 'world'] })
  scope: 'ikaros' | 'world';
  @Prop({ type: String, required: true, enum: ['ikaros', 'world', 'tm'] })
  speaker: 'ikaros' | 'world' | 'tm';
  @Prop() worldId?: string;
  @Prop() buildVersion?: string;
  @Prop() userAgent?: string;
}
export const BugReportContextSchema = SchemaFactory.createForClass(
  BugReportContextSchemaClass,
);

/**
 * Spec 25.1 — hlášení chyby (kanál Vypravěč). NEmaže se (audit); po vyřízení
 * `status:'resolved'`. Reporter volitelný (anon i přihlášený).
 */
@Schema({ collection: 'bug_reports' })
export class BugReportSchemaClass {
  @Prop({ required: true, maxlength: 4000 }) text: string;
  @Prop() email?: string;

  @Prop({ type: BugReportContextSchema, required: true })
  context: BugReportContextSchemaClass;

  @Prop() reporterId?: string;

  @Prop({ type: String, default: 'new', enum: ['new', 'resolved'] })
  status: BugReportStatus;

  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop() resolvedByUserId?: string;
  @Prop() resolvedAtUtc?: Date;
}

export const BugReportSchema =
  SchemaFactory.createForClass(BugReportSchemaClass);
BugReportSchema.index({ status: 1, createdAtUtc: -1 });
