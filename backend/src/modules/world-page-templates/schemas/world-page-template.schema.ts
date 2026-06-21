import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldPageTemplateDocument =
  HydratedDocument<WorldPageTemplateSchemaClass>;

@Schema({ timestamps: true, collection: 'world_page_templates' })
export class WorldPageTemplateSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ type: [String], default: [] }) headers: string[];
  @Prop() defaultTitle?: string;
  /** 15.5 — sanitizovaný TipTap HTML; osnova vkládaná do page.content při create. */
  @Prop() contentOutline?: string;
  @Prop() icon?: string;
  @Prop({ default: 0 }) order: number;
}

export const WorldPageTemplateSchema = SchemaFactory.createForClass(
  WorldPageTemplateSchemaClass,
);
// Unique (worldId, key) — slug jedinečný v rámci světa.
WorldPageTemplateSchema.index({ worldId: 1, key: 1 }, { unique: true });
WorldPageTemplateSchema.index({ worldId: 1, order: 1 });
