import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MailDailyCounterDocument =
  HydratedDocument<MailDailyCounterSchemaClass>;

/**
 * Per-den počítadlo odeslaných mailů (SMTP_DAILY_CAP) — jeden dokument na UTC
 * den (`day` = „YYYY-MM-DD"). Mongo `$inc` = atomické, přežije restart a je
 * sdílené mezi replikami (na rozdíl od in-memory čítače). Gmail cap je sice
 * klouzavé okno, per-UTC-den je konzervativní aproximace.
 */
@Schema({ timestamps: true, collection: 'mail_daily_counters' })
export class MailDailyCounterSchemaClass {
  @Prop({ required: true, unique: true }) day: string;
  @Prop({ required: true, type: Number, default: 0 }) sent: number;
}

export const MailDailyCounterSchema = SchemaFactory.createForClass(
  MailDailyCounterSchemaClass,
);

// TTL úklid starých denních čítačů (90 dní od posledního zápisu).
MailDailyCounterSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);
