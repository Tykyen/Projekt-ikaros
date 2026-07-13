import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { MailOutboxStatus } from '../interfaces/mail-outbox.interface';

export type MailOutboxDocument = HydratedDocument<MailOutboxSchemaClass>;

/**
 * Mail outbox (D-LAUNCH-GAP „SMTP bez fronty") — každý mail se nejdřív zapíše
 * sem, cron `MailOutboxSender` ho pak odešle (priorita+FIFO, retry, denní cap).
 *
 * Ukládá se UŽ VYRENDEROVANÝ obsah (subject/text/html) — auditní stopa „co
 * přesně odešlo" + sender nepotřebuje payload/template. Pozn.: html u resetu
 * obsahuje token v plaintextu (na rozdíl od `security_tokens`, kde je jen
 * hash) — inherentní vlastnost outboxu; mitigace = TTL úklid sent záznamů.
 */
@Schema({ timestamps: true, collection: 'mail_outbox' })
export class MailOutboxSchemaClass {
  @Prop({ required: true }) to: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) text: string;
  @Prop({ required: true }) html: string;
  /** MailerTemplate (kategorie pro diagnostiku/prioritizaci). */
  @Prop({ required: true, type: String }) category: string;
  /** Nižší = dřív (MAIL_PRIORITY_HIGH=1 reset hesla, MAIL_PRIORITY_NORMAL=5). */
  @Prop({ required: true, type: Number }) priority: number;
  @Prop({ required: true, type: String, default: 'pending' })
  status: MailOutboxStatus;
  @Prop({ required: true, type: Number, default: 0 }) attempts: number;
  @Prop({ required: true, type: Date }) nextAttemptAt: Date;
  @Prop({ type: Date }) sentAt?: Date;
  /** Poslední SMTP chyba per adresát (bounce-lite evidence). */
  @Prop({ type: String }) lastError?: string;
  /** SMTP odpověď při úspěchu („250 …") — předáno SMTP, NE doručeno. */
  @Prop({ type: String }) smtpResponse?: string;
}

export const MailOutboxSchema = SchemaFactory.createForClass(
  MailOutboxSchemaClass,
);

// Hlavní dotaz senderu: pending + due, řazeno priorita → FIFO.
MailOutboxSchema.index({
  status: 1,
  nextAttemptAt: 1,
  priority: 1,
  createdAt: 1,
});
// TTL úklid odeslaných záznamů po 30 dnech (html nese tokeny → nedržet věčně).
// `sentAt` mají jen sent dokumenty — pending/failed TTL nesmaže.
MailOutboxSchema.index(
  { sentAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);
