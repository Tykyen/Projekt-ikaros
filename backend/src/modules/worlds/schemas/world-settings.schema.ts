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
  // Znak skupiny (emblém) — název skupiny → url obrázku. Read-time enrich
  // do `imageUrl` linkovaného chat ChatGroup (ikona kanálu). Single source.
  @Prop({ type: Object, default: {} }) groupImages: Record<string, string>;
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
  // 12.2 — „Last info" box: krátké oznámení PJ členům světa (proužek pod
  // hlavičkou). `null` = nenastaveno. `updatedAt` doplňuje server při změně
  // textu (klientský dismiss se váže právě na něj).
  @Prop({ type: Object, default: null, _id: false, required: false })
  lastInfo?: { text: string; visible: boolean; updatedAt: Date } | null;
  // 6.8 — PJ persona v chatu. Vedení (role ≥ PomocnyPJ) vystupuje pod jednotnou
  // identitou místo přihlašovacího jména. Render-time (neukládá se do zpráv),
  // takže se projeví zpětně i na historických zprávách. `null` = nenastaveno
  // (FE default: enabled true, name „PJ", avatar fallback na iniciálu).
  @Prop({ type: Object, default: null, _id: false, required: false })
  pjChatPersona?: {
    enabled: boolean;
    name: string | null;
    avatarUrl: string | null;
    // 6.8-followup — `unified` (default) | `individual`. Chybí → migrace v toEntity.
    mode?: 'unified' | 'individual';
  } | null;
  // 15.4 (E) — výchozí nastavení map světa (seed nové scény). `null` = nenastaveno.
  @Prop({ type: Object, default: null, _id: false, required: false })
  mapDefaults?: Record<string, unknown> | null;
  @Prop({ default: Date.now }) updatedAt: Date;
}

export const WorldSettingsSchema = SchemaFactory.createForClass(
  WorldSettingsSchemaClass,
);
