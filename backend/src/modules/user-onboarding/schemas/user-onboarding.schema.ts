import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserOnboardingDocument =
  HydratedDocument<UserOnboardingSchemaClass>;

export type VypravecPersona = 'pj' | 'hrac' | 'worldbuilder';
export type VypravecMode = 'active' | 'onCall';

/** Průběh jedné cesty (26.1–26.3). Klíče steps = stepId s escapnutými tečkami. */
export interface JourneyProgress {
  startedAt: Date;
  /** 04 §2.1 — fixace světa cesty; first-write-wins, mění jen explicitní restart. */
  contextWorldId?: string;
  steps: Record<string, Date>;
  pausedAt?: Date | null;
  dismissedAt?: Date | null;
}

/**
 * Spec 26.3 (D6) — stav Vypravěče per uživatel. Merge sémantika je VÝHRADNĚ
 * v service přes Mongo operátory ($addToSet/$min/$set) — žádný read-modify-write,
 * souběh mobil+desktop nesmí vracet zavřené bubliny (lekce race 23.5).
 * Klíče map (journeys/steps/milestones) jsou na zápisu escapované `.` → `:`
 * (Mongo dot-path); ven se vrací neescapované (toEntity).
 */
@Schema({ timestamps: true, collection: 'user_onboarding' })
export class UserOnboardingSchemaClass {
  @Prop({ required: true, unique: true, index: true }) userId: string;

  @Prop({ type: String, default: null }) persona: VypravecPersona | null;

  @Prop({ type: Object, default: {} }) journeys: Record<
    string,
    JourneyProgress
  >;

  @Prop({ type: [String], default: [] }) seenRoutes: string[];
  @Prop({ type: [String], default: [] }) dismissed: string[];

  @Prop({ type: Object, default: {} }) milestones: Record<string, Date>;

  @Prop({ type: String, default: 'active' }) mode: VypravecMode;

  @Prop({ type: String }) lastSeenChangelog?: string;

  /** 04 §5.4 — účet starší než nasazení Vypravěče; vyloučen z funnel metrik. */
  @Prop({ type: Boolean, default: false }) backfilled: boolean;
}

export const UserOnboardingSchema = SchemaFactory.createForClass(
  UserOnboardingSchemaClass,
);
