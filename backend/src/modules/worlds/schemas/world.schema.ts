import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldDocument = HydratedDocument<WorldSchemaClass>;

@Schema({ timestamps: true, collection: 'worlds' })
export class WorldSchemaClass {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, unique: true, lowercase: true }) slug: string;
  /**
   * D-NEW-slug-rename — historie všech předchozích slugů.
   * Worlds repo `findByCurrentOrPreviousSlug` matchuje i staré, takže
   * `/svet/old-slug` po renamu redirectne na `/svet/new-slug`.
   */
  @Prop({ type: [String], default: [] }) previousSlugs: string[];
  @Prop() description?: string;
  @Prop() imageUrl?: string;
  @Prop() genre?: string;
  @Prop({ type: [String], default: [] }) tones: string[];
  @Prop() playersWanted?: string;
  @Prop({ default: 0 }) playerCount: number;
  @Prop({ type: Number, required: false, default: null, min: 1, max: 999 })
  maxPlayers?: number | null;
  @Prop({ type: [String], default: [] }) dice: string[];
  @Prop({ default: 'matrix' }) system: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 'private' }) accessMode: string;
  @Prop({ type: [{ slug: String, name: String }], default: [] })
  offeredCharacters: { slug: string; name: string }[];
  @Prop({ type: [String], default: [] }) favoritePageSlugs: string[];

  // ── 9.2b — Multi-config kalendáře ──
  /** Slug výchozího kalendáře (z `world_calendar_configs`). Auto-seed → 'gregorian'. */
  @Prop({ default: 'gregorian' }) defaultCalendarConfigSlug: string;
  /** Společný `absDay` epoch napříč všemi kalendáři světa (PJ může posunout). */
  @Prop({ default: 0 }) timelineEpoch: number;

  // ── Krok 5.0 — světový theme ──
  /** Id sdíleného základu (preset nebo 'matrix'). Volí PJ ve wizardu tvorby světa. */
  @Prop({ default: 'modre-nebe' }) themeId: string;
  /** Custom theme — mapa CSS token → hodnota; vrství se nad themeId. Editor = krok 5.3f. */
  @Prop({ type: Object, default: {} }) themeOverrides: Record<string, string>;
  /** Custom theme — URL vlastního pozadí; přebíjí pozadí presetu. */
  @Prop() themeBackgroundUrl?: string;

  /**
   * 10.2-prep-1 — atomic counter pro world operations API (cross-scene log).
   * Per-world scope, nezávislý na `MapScene.lastSeqNumber` (per-scene).
   */
  @Prop({ default: 0 }) lastSeqNumber: number;

  /**
   * 10.2i — počasí vyslané PJ na taktickou mapu světa.
   * `{ generatorId, generatorName, weather (WeatherResult snapshot), setAt }`
   * nebo `null` (žádné počasí na mapě).
   */
  @Prop({ type: Object, default: null })
  activeMapWeather?: Record<string, unknown> | null;
}

export const WorldSchema = SchemaFactory.createForClass(WorldSchemaClass);
WorldSchema.index({ ownerId: 1 });
WorldSchema.index({ isActive: 1 });
// D-NEW-slug-rename — fulltext lookup po starých slug (sparse pole).
WorldSchema.index({ previousSlugs: 1 });
