import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FriendshipSchemaClass } from '../schemas/friendship.schema';
import type {
  Friendship,
  FriendshipStatus,
} from '../interfaces/friendship.interface';
import type { IFriendshipsRepository } from '../interfaces/friendships-repository.interface';

@Injectable()
export class MongoFriendshipsRepository implements IFriendshipsRepository {
  constructor(
    @InjectModel(FriendshipSchemaClass.name)
    private readonly model: Model<FriendshipSchemaClass>,
  ) {}

  async create(requesterId: string, recipientId: string): Promise<Friendship> {
    const doc = await this.model.create({
      requesterId,
      recipientId,
      status: 'pending',
    });
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<Friendship | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findActiveBetween(a: string, b: string): Promise<Friendship | null> {
    const doc = await this.model
      .findOne({
        status: { $in: ['pending', 'accepted'] },
        $or: [
          { requesterId: a, recipientId: b },
          { requesterId: b, recipientId: a },
        ],
      })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findLatestRejected(
    requesterId: string,
    recipientId: string,
  ): Promise<Friendship | null> {
    // Cool-down: lookup nejaktuálnější rejected od recipient→requester
    // (tj. recipient minulý dříve řekl ne sender → cool-down active sender).
    const doc = await this.model
      .findOne({
        requesterId,
        recipientId,
        status: 'rejected',
      })
      .sort({ rejectedAt: -1 })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async accept(id: string, acceptedAt: Date): Promise<Friendship | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { status: 'accepted', acceptedAt }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async markRejected(id: string, rejectedAt: Date): Promise<Friendship | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { status: 'rejected', rejectedAt }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async listAcceptedForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Friendship[]; total: number }> {
    const filter: Record<string, unknown> = {
      status: 'accepted',
      $or: [{ requesterId: userId }, { recipientId: userId }],
    };
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ acceptedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
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

  async findAllForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Friendship[]; total: number }> {
    // D-056 (N-6b) — admin pohled: všechny statusy (pending/accepted/rejected).
    const filter: Record<string, unknown> = {
      $or: [{ requesterId: userId }, { recipientId: userId }],
    };
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ requestedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
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

  async listOutgoingPendingForUser(userId: string): Promise<Friendship[]> {
    const docs = await this.model
      .find({ requesterId: userId, status: 'pending' })
      .sort({ requestedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async listIncomingPendingForUser(userId: string): Promise<Friendship[]> {
    const docs = await this.model
      .find({ recipientId: userId, status: 'pending' })
      .sort({ requestedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countIncomingPendingForUser(userId: string): Promise<number> {
    return this.model
      .countDocuments({ recipientId: userId, status: 'pending' })
      .exec();
  }

  async removeAllActiveBetween(a: string, b: string): Promise<void> {
    await this.model
      .deleteMany({
        status: { $in: ['pending', 'accepted'] },
        $or: [
          { requesterId: a, recipientId: b },
          { requesterId: b, recipientId: a },
        ],
      })
      .exec();
  }

  private toEntity(doc: Record<string, unknown>): Friendship {
    return {
      id: String(doc._id),
      requesterId: doc.requesterId as string,
      recipientId: doc.recipientId as string,
      status: doc.status as FriendshipStatus,
      requestedAt: doc.requestedAt as Date,
      acceptedAt: doc.acceptedAt as Date | undefined,
      rejectedAt: doc.rejectedAt as Date | undefined,
    };
  }
}
