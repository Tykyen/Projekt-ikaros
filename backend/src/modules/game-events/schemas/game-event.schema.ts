import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GameEventDocument = HydratedDocument<GameEventSchemaClass>;

@Schema({ _id: false })
export class EventConfirmationSchemaClass {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) userName: string;
}
export const EventConfirmationSchema = SchemaFactory.createForClass(
  EventConfirmationSchemaClass,
);

@Schema({ _id: false })
export class EventCommentSchemaClass {
  @Prop({ required: true }) id: string;
  @Prop({ default: null, type: String }) parentId: string | null;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true, default: '' }) content: string;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ default: null, type: Date }) editedAt: Date | null;
  @Prop({ type: Object, default: {} }) reactions: Record<string, string[]>;
  @Prop({ default: false }) isDeleted: boolean;
}
export const EventCommentSchema = SchemaFactory.createForClass(
  EventCommentSchemaClass,
);

@Schema({ timestamps: true, collection: 'game_events' })
export class GameEventSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true, index: true }) date: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: null, type: String }) imageUrl: string | null;
  @Prop({ default: null, type: Number }) imageFocalX: number | null;
  @Prop({ default: null, type: Number }) imageFocalY: number | null;
  // 9.5+ — zoom v procentech (25–400, default null = 100 = cover).
  @Prop({ default: null, type: Number }) imageZoom: number | null;
  // 9.5+ — fit režim: 'cover' (default, vyplnit) nebo 'contain' (vidět celý).
  @Prop({ default: null, type: String, enum: ['cover', 'contain', null] })
  imageFit: 'cover' | 'contain' | null;
  @Prop({ default: null, type: String }) targetGroup: string | null;
  @Prop({ default: false }) groupOnly: boolean;
  // F-11 — align na FE/UI: zod default(true), UI očekává potvrzování zapnuté.
  @Prop({ default: true }) confirmable: boolean;
  @Prop({ type: [EventConfirmationSchema], default: [] })
  confirmedBy: EventConfirmationSchemaClass[];
  @Prop({ type: [EventCommentSchema], default: [] })
  comments: EventCommentSchemaClass[];
  @Prop({ default: false }) reminderSent: boolean;
  // 15.9 — připomínka 1h před začátkem (nezávislá na 24h reminderSent).
  @Prop({ default: false }) reminder1hSent: boolean;
}

export const GameEventSchema =
  SchemaFactory.createForClass(GameEventSchemaClass);
GameEventSchema.index({ worldId: 1, date: 1 });
