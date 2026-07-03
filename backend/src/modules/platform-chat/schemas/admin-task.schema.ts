import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** 20.5 — úkoly týmu správy. `timestamps` → createdAt/updatedAt. */
@Schema({ collection: 'admin_tasks', timestamps: true })
export class AdminTaskSchemaClass {
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true })
  ownerName: string;

  @Prop({ required: true })
  text: string;

  @Prop({ default: false })
  done: boolean;

  @Prop({ default: 0 })
  order: number;

  @Prop({ required: true })
  createdBy: string;
}

export type AdminTaskDocument = HydratedDocument<AdminTaskSchemaClass>;

export const AdminTaskSchema =
  SchemaFactory.createForClass(AdminTaskSchemaClass);
