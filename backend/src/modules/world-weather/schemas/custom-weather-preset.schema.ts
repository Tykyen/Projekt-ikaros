// backend/src/modules/world-weather/schemas/custom-weather-preset.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * 9.4-dluh — Custom weather preset per svět.
 *
 * Per-world scoped (nikdy nesdílet napříč světy). `config` je immutable
 * po vytvoření — uživatel může upravit jen name/description/emoji. To proto,
 * aby existující generátory vytvořené z custom presetu zůstaly v sync s presety
 * resp. aby reálně reprezentovaly stav v době uložení (PJ snapshot).
 */
@Schema({ timestamps: true, collection: 'world_custom_weather_presets' })
export class CustomWeatherPresetSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop() description?: string;
  /** Volitelná ikona (emoji). UI ukáže fallback ⭐ pokud chybí. */
  @Prop() emoji?: string;
  /** Snapshot WeatherGeneratorConfig — Object typ kvůli flexibilitě (subdokumenty). */
  @Prop({ type: Object, required: true }) config: Record<string, unknown>;
  /** Userid PJ který preset vytvořil. */
  @Prop({ required: true }) createdBy: string;
  /** Counter — increment při „Použít" v wizardu. Slouží pro sort „nejčastěji použité". */
  @Prop({ default: 0 }) usageCount: number;
}

export const CustomWeatherPresetSchema = SchemaFactory.createForClass(
  CustomWeatherPresetSchemaClass,
);

// Compound index pro list per svět seřazený dle recency (createdAt desc default).
CustomWeatherPresetSchema.index({ worldId: 1, createdAt: -1 });
// Compound index pro sort podle usageCount (most used first).
CustomWeatherPresetSchema.index({ worldId: 1, usageCount: -1 });
