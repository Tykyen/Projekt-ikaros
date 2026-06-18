import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TrustedDeviceSchemaClass } from '../schemas/trusted-device.schema';
import type {
  ITrustedDevicesRepository,
  CreateTrustedDeviceInput,
} from '../interfaces/trusted-devices-repository.interface';
import type { TrustedDevice } from '../interfaces/trusted-device.interface';

@Injectable()
export class MongoTrustedDevicesRepository implements ITrustedDevicesRepository {
  constructor(
    @InjectModel(TrustedDeviceSchemaClass.name)
    private readonly model: Model<TrustedDeviceSchemaClass>,
  ) {}

  async save(input: CreateTrustedDeviceInput): Promise<TrustedDevice> {
    const doc = await this.model.create(input);
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findByTokenHash(tokenHash: string): Promise<TrustedDevice | null> {
    const doc = await this.model.findOne({ tokenHash }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByUserId(userId: string): Promise<TrustedDevice[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ lastUsedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async touch(id: string, lastUsedAt: Date): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.findByIdAndUpdate(id, { lastUsedAt }).exec();
  }

  async deleteById(id: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.deleteOne({ _id: id, userId }).exec();
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.model.deleteMany({ userId }).exec();
  }

  private toEntity(doc: Record<string, unknown>): TrustedDevice {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      tokenHash: doc.tokenHash as string,
      label: doc.label as string,
      lastUsedAt: doc.lastUsedAt as Date,
      expiresAt: doc.expiresAt as Date,
      createdAt: doc.createdAt as Date,
    };
  }
}
