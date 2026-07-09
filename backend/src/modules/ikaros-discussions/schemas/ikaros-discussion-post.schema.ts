import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosDiscussionPostDocument =
  HydratedDocument<IkarosDiscussionPostSchemaClass>;

@Schema({ collection: 'ikaros_discussion_posts' })
export class IkarosDiscussionPostSchemaClass {
  @Prop({ required: true }) discussionId: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true }) content: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  // B4d (spec 20B) — moderační skrytí příspěvku (akce M2/M3). Skrytý příspěvek
  // veřejné čtení vynechá; vidí ho jen reviewer set. `moderationHiddenReason` je
  // interní stopa (rozhodnutí, kvůli němuž byl skryt).
  @Prop({ default: false }) moderationHidden?: boolean;
  @Prop() moderationHiddenReason?: string;
}

export const IkarosDiscussionPostSchema = SchemaFactory.createForClass(
  IkarosDiscussionPostSchemaClass,
);
IkarosDiscussionPostSchema.index({ discussionId: 1, createdAtUtc: 1 });
