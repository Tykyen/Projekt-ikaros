import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  IIkarosEventRepository,
  UpdateEventFields,
} from '../interfaces/ikaros-event-repository.interface';
import type { IkarosEventItem } from '../interfaces/ikaros-event.interface';
import { IkarosEventSchemaClass } from '../schemas/ikaros-event.schema';

@Injectable()
export class MongoIkarosEventRepository implements IIkarosEventRepository {
  constructor(
    @InjectModel(IkarosEventSchemaClass.name)
    private readonly model: Model<IkarosEventSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): IkarosEventItem {
    return {
      id: String(doc._id),
      title: doc.title as string,
      date: doc.date as Date,
      description: (doc.description as string | undefined) ?? undefined,
      imageUrl: (doc.imageUrl as string | undefined) ?? undefined,
      imageFocalX: (doc.imageFocalX as number | undefined) ?? undefined,
      imageFocalY: (doc.imageFocalY as number | undefined) ?? undefined,
      imageZoom: (doc.imageZoom as number | undefined) ?? undefined,
      // FIX-71 — dřív chybělo (schema/create/update ho ukládaly, ale čtení ho
      // tiše zahazovalo → feature mrtvá).
      imageFit: (doc.imageFit as 'cover' | 'contain' | undefined) ?? undefined,
      confirmable: (doc.confirmable as boolean | undefined) ?? true,
      attendeeUserIds: (doc.attendeeUserIds as string[] | undefined) ?? [],
      authorId: doc.authorId as string,
      authorName: (doc.authorName as string | undefined) ?? undefined,
      createdAtUtc: doc.createdAtUtc as Date,
      isActive: (doc.isActive as boolean | undefined) ?? true,
    };
  }

  async findActive(): Promise<IkarosEventItem[]> {
    const docs = await this.model
      .find({ isActive: true })
      .sort({ date: 1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findUpcoming(limit: number): Promise<IkarosEventItem[]> {
    const docs = await this.model
      .find({ isActive: true, date: { $gte: new Date() } })
      .sort({ date: 1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<IkarosEventItem | null> {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async create(data: Omit<IkarosEventItem, 'id'>): Promise<IkarosEventItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    fields: UpdateEventFields,
  ): Promise<IkarosEventItem | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: fields }, { new: true })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const doc = await this.model.findByIdAndDelete(id).exec();
    return doc !== null;
  }

  async setAttendee(
    id: string,
    userId: string,
    attending: boolean,
  ): Promise<IkarosEventItem | null> {
    const update = attending
      ? { $addToSet: { attendeeUserIds: userId } }
      : { $pull: { attendeeUserIds: userId } };
    const doc = await this.model
      .findByIdAndUpdate(id, update, { new: true })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }
}
