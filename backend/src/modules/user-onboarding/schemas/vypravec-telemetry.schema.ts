import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VypravecTelemetryDocument =
  HydratedDocument<VypravecTelemetrySchemaClass>;

/** Spec 26.6 (D11) — whitelist eventů; funnel + obsahové díry (04 §5.6). */
export const TELEMETRY_EVENTS = [
  'persona_chosen',
  'journey_started',
  'step_done',
  'journey_dismissed',
  'topic_open',
  'search_miss',
  'no_topic',
  'feedback_plus',
  'feedback_minus',
  'dismissed',
] as const;
export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

/**
 * Spec 26.6 (D11) — telemetrie Vypravěče. GDPR přesně (04 §5.6): nese userId
 * (osobní údaj — funnel per-user, osobní follow-up odpadlých testerů),
 * ŽÁDNÁ entity ID světů/stránek, query truncate 200 znaků, TTL 90 dní,
 * výmaz při smazání účtu (listener v UserOnboardingService). Popsáno v /soukromi.
 * `return_d2`/`return_d7` NEJSOU eventy — počítá je funnel skript z updatedAt.
 */
@Schema({ collection: 'vypravec_telemetry' })
export class VypravecTelemetrySchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, type: String }) event: TelemetryEvent;
  /** Kontext bez entity ID: route pattern, topik/krok/cesta ID, dotaz (≤200). */
  @Prop({ type: String }) route?: string;
  @Prop({ type: String }) refId?: string;
  @Prop({ type: String }) query?: string;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}

export const VypravecTelemetrySchema = SchemaFactory.createForClass(
  VypravecTelemetrySchemaClass,
);

const NINETY_DAYS_S = 90 * 24 * 60 * 60;
VypravecTelemetrySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NINETY_DAYS_S },
);
VypravecTelemetrySchema.index({ event: 1, createdAt: -1 });
