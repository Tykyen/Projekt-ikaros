import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ScenarioTemplateDocument =
  HydratedDocument<ScenarioTemplateSchemaClass>;

/**
 * 11.2-ext E — knihovna scén (per-PJ, cross-world). `ownerId` required +
 * indexed, `timestamps: true`. `contentData` schemaless (storyTree snapshot).
 */
@Schema({ timestamps: true, collection: 'scenarioTemplates' })
export class ScenarioTemplateSchemaClass {
  @Prop({ required: true, index: true }) ownerId: string;
  @Prop({ required: true, minlength: 1, maxlength: 120 }) name: string;
  @Prop({ required: true, default: '' }) scenarioTitle: string;
  @Prop({ type: Object, default: {} }) contentData: Record<string, unknown>;
}

export const ScenarioTemplateSchema = SchemaFactory.createForClass(
  ScenarioTemplateSchemaClass,
);

ScenarioTemplateSchema.index({ ownerId: 1, updatedAt: -1 });
