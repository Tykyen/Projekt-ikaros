import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
class WeatherTypeEntrySchema {
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) icon: string;
  @Prop({ required: true }) probability: number;
  @Prop({ type: [Number], required: true }) cloudRange: number[];
  @Prop({ type: [Number], required: true }) precipRange: number[];
}

@Schema({ _id: false })
class CustomFieldConfigSchema {
  @Prop({ required: true }) label: string;
  @Prop({ type: [String], required: true }) possibleValues: string[];
  @Prop({ required: true }) probability: number;
}

@Schema({ _id: false })
class WeatherGeneratorConfigSchema {
  @Prop({ required: true }) tempMin: number;
  @Prop({ required: true }) tempMax: number;
  @Prop({ default: 'C' }) tempUnit: string;
  @Prop({ type: [Object], default: [] }) weatherTypes: WeatherTypeEntrySchema[];
  @Prop({ default: 0 }) windMin: number;
  @Prop({ default: 100 }) windMax: number;
  @Prop({ default: 2.0 }) windGustMultiplier: number;
  @Prop({ default: 960 }) pressureMin: number;
  @Prop({ default: 1040 }) pressureMax: number;
  @Prop({ default: 0 }) humidityMin: number;
  @Prop({ default: 100 }) humidityMax: number;
  @Prop({ type: [Object], default: [] })
  customFields: CustomFieldConfigSchema[];
}

@Schema({ timestamps: true, collection: 'world_weather_generators' })
export class WeatherGeneratorSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop() description?: string;
  @Prop({ type: Object, required: true }) config: WeatherGeneratorConfigSchema;
  @Prop({ type: Object }) currentWeather?: Record<string, unknown>;
}

export const WeatherGeneratorSchema = SchemaFactory.createForClass(
  WeatherGeneratorSchemaClass,
);
WeatherGeneratorSchema.index({ worldId: 1 });
