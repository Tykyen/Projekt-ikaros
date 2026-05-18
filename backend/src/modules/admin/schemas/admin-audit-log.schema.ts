import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type {
  AdminAuditAction,
  AuditTargetType,
} from '../interfaces/admin-audit-log.interface';

export type AdminAuditLogDocument = HydratedDocument<AdminAuditLogSchemaClass>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'admin_audit_log',
})
export class AdminAuditLogSchemaClass {
  @Prop({ required: true, index: true }) actorId: string;
  @Prop({ required: true }) actorUsername: string;
  @Prop({ required: true, index: true }) targetId: string;
  @Prop({ required: true }) targetUsername: string;
  // D-067 — typ cílové entity; starší záznamy bez pole = 'user'.
  @Prop({ type: String, default: 'user', index: true })
  targetType: AuditTargetType;
  @Prop({ required: true, type: String, index: true }) action: AdminAuditAction;
  @Prop({ type: Object }) before?: Record<string, unknown> | null;
  @Prop({ type: Object }) after?: Record<string, unknown> | null;
  @Prop({ type: String }) reason?: string | null;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(
  AdminAuditLogSchemaClass,
);
// Compound indexes pro queries po actorId/targetId
AdminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ targetId: 1, createdAt: -1 });
