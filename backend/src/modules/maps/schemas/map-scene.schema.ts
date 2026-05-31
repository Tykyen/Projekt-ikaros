import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type MapSceneDocument = HydratedDocument<MapSceneSchemaClass>;

@Schema({ timestamps: false, collection: 'mapScenes' })
export class MapSceneSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ default: '' }) name: string;
  @Prop({ default: '' }) imageUrl: string;
  @Prop() folder?: string;
  @Prop({
    type: Object,
    default: { size: 40, originX: 0, originY: 0, showGrid: true },
  })
  config: Record<string, unknown>;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  tokens: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  npcTemplates: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  effects: Record<string, unknown>[];
  /**
   * 10.2j — persistovaná historie hodů scény. Cap 50 nejnovějších
   * (atomic `$push` + `$slice: -50` v applyAtomic). Tvar: MapDiceRoll
   * (byUserId, rollerName, rollerKind, category, dicePayload, rolledAt, tokenId?).
   */
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  diceRolls: Record<string, unknown>[];
  @Prop({ default: false }) fogEnabled: boolean;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  revealedHexes: Record<string, unknown>[];
  @Prop() templateId?: string;
  @Prop({ default: false }) isActive: boolean;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({ default: false }) isLocked: boolean;
  /**
   * 10.2n — per-hráč override skrytí/zámku nad per-scéna defaultem
   * (`isHidden`/`isLocked`). Tvar: `{ userId, isHidden?, isLocked? }`. Efektivní
   * stav hráče = override ?? scéna-default. Prázdné entries se neukládají
   * (apply je čistí); `scene.state` daný field z overrides smaže („na všechny").
   */
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  playerStates: Record<string, unknown>[];
  @Prop({ type: [String], default: [] }) activeSoundIds: string[];
  @Prop() lastModified?: Date;
  /**
   * 10.2-prep-1 — atomic counter pro operations API.
   * Inkrementovaný `$inc` při každé operaci nad touto scénou; výsledná hodnota
   * se použije jako `MapOperation.seqNumber`. Per-scene scope = paralelní scény
   * mají nezávislé sekvence.
   */
  @Prop({ default: 0 }) lastSeqNumber: number;

  /**
   * 10.2-prep-1 — combat tracker subdoc. Plná semantika viz spec
   * `combat` komponenty (10.2f); zde jen schema permitting strukturu.
   * `null`/absent = boj není aktivní.
   *
   * Tvar (žije pod tímto JSON Objectem):
   * ```
   * { isActive, round, currentTokenId, order: [...], endOfTurnEffects: [...],
   *   startedAt, startedByUserId }
   * ```
   */
  @Prop({ type: Object, default: null }) combat: Record<string, unknown> | null;

  /**
   * 10.2c-edit-7 — per-scéna whitelist NPC postav. ID = `Character._id`
   * (string). PJ vybere NPC z globálního katalogu (50+) jen ty, které pro
   * tuhle mapu potřebuje. Spawn na mapu probíhá jen z tohoto setu.
   * Default `[]` = scéna nemá předvybrané NPC (paleta prázdná).
   */
  @Prop({ type: [String], default: [] })
  activeCharacterIds: string[];

  /**
   * 10.2c-edit-7 — per-scéna whitelist bestií. ID = `Bestie.id` (system/world/
   * user scope; rozlišení scope-u je na FE při render listů). Default `[]`.
   */
  @Prop({ type: [String], default: [] })
  activeBestieIds: string[];
}

export const MapSceneSchema = SchemaFactory.createForClass(MapSceneSchemaClass);
MapSceneSchema.index({ worldId: 1 });
MapSceneSchema.index({ worldId: 1, isActive: 1 });
