// 9.4 dluh #2 — historie počasí (snapshot persistence).
// Po každém generate/setCurrent/advance-day uloží snapshot WeatherResult
// do separate collection. PJ může otevřít „Historie" view per generátor.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WeatherHistoryDocument =
  HydratedDocument<WeatherHistorySchemaClass>;

export type WeatherHistoryTrigger = 'generate' | 'manual' | 'advance-day';

@Schema({
  timestamps: { createdAt: 'recordedAt', updatedAt: false },
  collection: 'world_weather_history',
})
export class WeatherHistorySchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true, index: true }) generatorId: string;
  /** Snapshot `WeatherResult` shape — uložen jako mixed object pro flexibilitu. */
  @Prop({ type: Object, required: true }) weather: Record<string, unknown>;
  /** In-game datum, ke kterému se snapshot vztahuje (advance-day trigger). */
  @Prop({ type: Date, default: null }) inGameDate: Date | null;
  /** Trigger typu snapshotu — `generate` | `manual` | `advance-day`. */
  @Prop({
    type: String,
    required: true,
    enum: ['generate', 'manual', 'advance-day'],
  })
  trigger: WeatherHistoryTrigger;
  // recordedAt přidá timestamps automaticky
}

export const WeatherHistorySchema = SchemaFactory.createForClass(
  WeatherHistorySchemaClass,
);
// 9.4 dluh #2 — compound index pro načítání historie generátoru (sort desc)
WeatherHistorySchema.index({ worldId: 1, generatorId: 1, recordedAt: -1 });
