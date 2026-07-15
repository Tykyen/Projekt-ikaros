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
  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10); staré docs nemají. */
  @Prop() imageBytes?: number;
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
  // Soft-delete recovery — `deletedAt` != null => svet je v 30denním okně pro
  // obnovu (Admin/Superadmin). Po okně cron hard-delete. `deletedBy` = audit.
  @Prop({ type: Date, default: null }) deletedAt: Date | null;
  @Prop({ type: String, default: null }) deletedBy: string | null;
  @Prop({ default: 'private' }) accessMode: string;
  /**
   * 22.4 — veřejná výkladní skříň: anonym smí read-only nahlížet do vybraných
   * sekcí světa (kontrakt anon = Čtenář). Jen ne-private světy; přechod na
   * private flag automaticky shodí (worlds.service.update).
   */
  @Prop({ default: false }) publicShowcase: boolean;
  @Prop({ type: [{ slug: String, name: String }], default: [] })
  offeredCharacters: { slug: string; name: string }[];

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
  /** D-19.2 — velikost blobu `themeBackgroundUrl` v bytech; staré docs nemají. */
  @Prop() themeBackgroundBytes?: number;

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

  /**
   * 10.2j — viditelnost hodů kostkou na mapě.
   * `{ showPjRolls, showNpcBestieRolls, showTeammateRolls }` nebo `undefined`.
   */
  @Prop({ type: Object, default: undefined })
  diceVisibility?: {
    showPjRolls: boolean;
    showNpcBestieRolls: boolean;
    showTeammateRolls: boolean;
  };

  /**
   * 2.3d — technologická úroveň světa (rozsah TÚ 0–14). Nastavuje se při tvorbě
   * světa; seeduje stránku „Technologie". Po založení se needituje v Nastavení.
   */
  @Prop({ type: Number, default: null, min: 0, max: 14 })
  techLevelMin?: number | null;
  @Prop({ type: Number, default: null, min: 0, max: 14 })
  techLevelMax?: number | null;

  /**
   * 2.3e — typy (tradice) magie přítomné ve světě. Nastavuje se při tvorbě
   * světa; seeduje stránku „Magický systém". Po založení se needituje v Nastavení.
   */
  @Prop({ type: [String], default: [] })
  magicTraditions: string[];
}

export const WorldSchema = SchemaFactory.createForClass(WorldSchemaClass);
WorldSchema.index({ ownerId: 1 });
WorldSchema.index({ isActive: 1 });
// D-NEW-slug-rename — fulltext lookup po starých slug (sparse pole).
WorldSchema.index({ previousSlugs: 1 });
