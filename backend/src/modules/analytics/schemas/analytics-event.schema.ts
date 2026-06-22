import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AnalyticsEventDocument =
  HydratedDocument<AnalyticsEventSchemaClass>;

/** 15B.7 — kategorie zdroje návštěvy (odvozeno z referreru na BE). */
export type ReferrerCategory =
  | 'search'
  | 'social'
  | 'referral'
  | 'internal'
  | 'direct';

/**
 * 15B.7 — jeden page-view. Self-hosted, GDPR-čisté: ŽÁDNÉ PII —
 * neukládá se IP, user-agent ani userId. `sessionId` = anonymní nonce
 * (sessionStorage, per-tab). TTL 90 d → historie se maže sama (žádný cron).
 */
@Schema({ collection: 'analytics_events' })
export class AnalyticsEventSchemaClass {
  @Prop({ required: true }) path: string;
  @Prop({ required: true }) referrerCategory: ReferrerCategory;
  @Prop({ required: true }) sessionId: string;
  @Prop({ required: true, default: false }) authed: boolean;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(
  AnalyticsEventSchemaClass,
);

// TTL index — Mongo sama smaže eventy starší 90 dní.
const NINETY_DAYS_S = 90 * 24 * 60 * 60;
AnalyticsEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NINETY_DAYS_S },
);
// Agregační indexy (dashboard summary).
AnalyticsEventSchema.index({ createdAt: -1, path: 1 });
AnalyticsEventSchema.index({ createdAt: -1, referrerCategory: 1 });
