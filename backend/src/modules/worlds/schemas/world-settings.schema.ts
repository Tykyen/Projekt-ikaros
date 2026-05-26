import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type WorldSettingsDocument = HydratedDocument<WorldSettingsSchemaClass>;

@Schema({ collection: 'worldsettings' })
export class WorldSettingsSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ type: [String], default: [] }) hiddenNavItems: string[];
  @Prop({ type: [String], default: [] }) customGroups: string[];
  @Prop({ type: Object, default: {} }) groupColors: Record<string, string>;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  customHeadline: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  currencies: Record<string, unknown>[];
  @Prop({ default: false }) hideDefaultWeather: boolean;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  akjTypes: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  menuTemplates: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  diarySchema: Record<string, unknown>[];
  // Side-task character-tab-visibility — PJ override viditelnosti subdoc tabů
  // (Soukromé/Deník/Finance/Výbava/Kalendář/Poznámky) per typ Page (PostavaHrace/NPC).
  // `undefined` v dokumentu = výchozí (vše viditelné) — žádná migrace, žádný backfill.
  @Prop({ type: Object, default: undefined, _id: false, required: false })
  characterTabVisibility?: {
    PostavaHrace?: string[];
    NPC?: string[];
  };
  // 9.3 — slug calendar configu pro timeline (null = fallback na první config).
  @Prop({ type: String, default: null }) timelineCalendarSlug: string | null;
  // 9.4 dluh #1 — in-game date pro advance-day mechanism.
  // null = nezahájen herní čas (init při prvním advance z `new Date()`).
  @Prop({ type: Date, default: null }) currentInGameDate: Date | null;
  @Prop({ default: Date.now }) updatedAt: Date;
}

export const WorldSettingsSchema = SchemaFactory.createForClass(
  WorldSettingsSchemaClass,
);
