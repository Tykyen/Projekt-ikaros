import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { INaboryRepository } from '../interfaces/nabory-repository.interface';
import type {
  Nabor,
  NaborStrana,
  NaborMotiv,
  NaborMode,
  NaborStatus,
} from '../interfaces/nabor.interface';
import { NaborSchemaClass } from '../schemas/nabor.schema';

@Injectable()
export class MongoNaboryRepository implements INaboryRepository {
  constructor(
    @InjectModel(NaborSchemaClass.name)
    private readonly model: Model<NaborSchemaClass>,
  ) {}

  // be_field_check — whitelist mapper; nové pole přidat i sem.
  private toEntity(doc: Record<string, unknown>): Nabor {
    const reportedBy = (doc.reportedBy as string[]) ?? [];
    return {
      id: String((doc._id as { toString(): string }).toString()),
      strana: doc.strana as NaborStrana,
      motiv: doc.motiv as NaborMotiv,
      worldId: (doc.worldId as string) ?? undefined,
      worldSlug: (doc.worldSlug as string) ?? undefined,
      worldName: (doc.worldName as string) ?? undefined,
      title: doc.title as string,
      body: (doc.body as string) ?? '',
      imageUrl: (doc.imageUrl as string) ?? undefined,
      system: (doc.system as string) ?? undefined,
      mode: doc.mode as NaborMode,
      place: (doc.place as string) ?? undefined,
      seatsTotal: (doc.seatsTotal as number) ?? undefined,
      seatsTaken: (doc.seatsTaken as number) ?? 0,
      status: (doc.status as NaborStatus) ?? 'open',
      authorId: doc.authorId as string,
      authorName: doc.authorName as string,
      reportCount: reportedBy.length,
      createdAtUtc: doc.createdAtUtc as Date,
      expiresAtUtc: (doc.expiresAtUtc as Date) ?? undefined,
    };
  }

  async findActive(): Promise<Nabor[]> {
    const now = new Date();
    const docs = await this.model
      .find({
        status: { $ne: 'expired' },
        $or: [
          { expiresAtUtc: { $exists: false } },
          { expiresAtUtc: null },
          { expiresAtUtc: { $gt: now } },
        ],
      })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<Nabor | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Omit<Nabor, 'id'>): Promise<Nabor> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<Nabor>): Promise<Nabor | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.model.findByIdAndDelete(id).lean().exec();
    return res !== null;
  }

  async addReport(id: string, userId: string): Promise<Nabor | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $addToSet: { reportedBy: userId } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments().exec();
  }
}
