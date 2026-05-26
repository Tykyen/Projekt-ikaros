// backend/src/modules/world-weather/schemas/weather-generator-set.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

/**
 * 9.4 Weather Generator Set — pojmenovaný balíček preset itemů.
 *
 * Use case: PJ si vytvoří set „Evropa cestování" se 3 itemy (Praha, Vídeň, Berlín).
 * Klikne „Aplikovat set" → BE z FE-resolveovaných configů vytvoří 3 generátory
 * naráz. Inkrementuje `appliedCount`.
 *
 * Items mají `presetId` ve formátu:
 *   - 'archetype:<id>'        (např. archetype:cfb-oceanic)
 *   - 'country:<region>:<id>' (např. country:Evropa:Česko)
 *   - 'city:<region>:<country>:<id>' (např. city:Evropa:Česko:Praha)
 *   - 'extreme:<id>'          (např. extreme:naica)
 *   - 'custom:<presetId>'
 *
 * Resolving (preset → config) je FE záležitost (FE má všechny katalogy).
 * BE jen ukládá `presetId` jako string + default `generatorName`.
 */
@Schema({ _id: false })
class WeatherGeneratorSetItemSchema {
  @Prop({ required: true }) presetId: string;
  @Prop({ required: true }) generatorName: string;
  @Prop() description?: string;
}

@Schema({ timestamps: true, collection: 'world_weather_generator_sets' })
export class WeatherGeneratorSetSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop() description?: string;
  @Prop() emoji?: string;
  /**
   * Items — MixedArraySubSchema kvůli Mongoose 9.6 regresi pro `[Object]`/`[Mixed]`.
   * Viz `common/utils/mixed-array.schema.ts`.
   */
  @Prop({ type: [MixedArraySubSchema], default: () => [] })
  items: WeatherGeneratorSetItemSchema[];
  @Prop({ required: true }) createdBy: string;
  @Prop({ default: 0 }) appliedCount: number;
}

export const WeatherGeneratorSetSchema = SchemaFactory.createForClass(
  WeatherGeneratorSetSchemaClass,
);

// Sort dle recency per svět.
WeatherGeneratorSetSchema.index({ worldId: 1, createdAt: -1 });
