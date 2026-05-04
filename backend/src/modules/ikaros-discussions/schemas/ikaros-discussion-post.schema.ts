import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosDiscussionPostDocument = HydratedDocument<IkarosDiscussionPostSchemaClass>;

@Schema({ collection: 'ikaros_discussion_posts' })
export class IkarosDiscussionPostSchemaClass {
  @Prop({ required: true }) discussionId: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true }) content: string;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
}

export const IkarosDiscussionPostSchema = SchemaFactory.createForClass(IkarosDiscussionPostSchemaClass);
IkarosDiscussionPostSchema.index({ discussionId: 1, createdAtUtc: 1 });
