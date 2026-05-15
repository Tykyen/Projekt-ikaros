import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsernameChangeRequestSchemaClass } from '../schemas/username-change-request.schema';
import type {
  UsernameChangeRequest,
  UsernameChangeStatus,
} from '../interfaces/username-change-request.interface';
import type { IUsernameChangeRequestsRepository } from '../interfaces/username-change-requests-repository.interface';

@Injectable()
export class MongoUsernameChangeRequestsRepository implements IUsernameChangeRequestsRepository {
  constructor(
    @InjectModel(UsernameChangeRequestSchemaClass.name)
    private readonly model: Model<UsernameChangeRequestSchemaClass>,
  ) {}

  async create(input: {
    userId: string;
    username: string;
    requestedUsername: string;
  }): Promise<UsernameChangeRequest> {
    const doc = await this.model.create({ ...input, status: 'pending' });
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<UsernameChangeRequest | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findPendingByUserId(
    userId: string,
  ): Promise<UsernameChangeRequest | null> {
    const doc = await this.model
      .findOne({ userId, status: 'pending' })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findLastUnseenDecidedByUserId(
    userId: string,
  ): Promise<UsernameChangeRequest | null> {
    const doc = await this.model
      .findOne({
        userId,
        status: { $in: ['approved', 'rejected'] },
        seenAt: { $exists: false },
      })
      .sort({ decidedAt: -1 })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async markSeen(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { seenAt: new Date() }).exec();
  }

  async listPaginated(opts: {
    status?: UsernameChangeStatus;
    page: number;
    limit: number;
  }): Promise<{ items: UsernameChangeRequest[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
    const skip = (opts.page - 1) * opts.limit;
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(opts.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      items: docs.map((d) =>
        this.toEntity(d as unknown as Record<string, unknown>),
      ),
      total,
    };
  }

  async update(
    id: string,
    data: Partial<UsernameChangeRequest>,
  ): Promise<UsernameChangeRequest | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deletePending(userId: string): Promise<void> {
    await this.model.deleteMany({ userId, status: 'pending' }).exec();
  }

  private toEntity(doc: Record<string, unknown>): UsernameChangeRequest {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      username: doc.username as string,
      requestedUsername: doc.requestedUsername as string,
      status: doc.status as UsernameChangeStatus,
      requestedAt: doc.requestedAt as Date,
      decidedBy: doc.decidedBy as string | undefined,
      decidedAt: doc.decidedAt as Date | undefined,
      decisionReason: doc.decisionReason as string | undefined,
      seenAt: doc.seenAt as Date | undefined,
    };
  }
}
