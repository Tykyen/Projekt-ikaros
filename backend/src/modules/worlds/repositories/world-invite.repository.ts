import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { WorldInviteSchemaClass } from '../schemas/world-invite.schema';
import {
  WorldInvite,
  WorldInviteKind,
  WorldInviteStatus,
} from '../interfaces/world-invite.interface';
import type { IWorldInviteRepository } from '../interfaces/world-invite-repository.interface';

function isDuplicateKey(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: number }).code === 11000
  );
}

@Injectable()
export class MongoWorldInviteRepository
  extends BaseMongoRepository<WorldInvite>
  implements IWorldInviteRepository
{
  constructor(
    @InjectModel(WorldInviteSchemaClass.name)
    model: Model<WorldInviteSchemaClass>,
  ) {
    super(model as never);
  }

  async create(data: {
    worldId: string;
    kind: 'user' | 'link';
    invitedUserId?: string;
    token?: string;
    createdBy: string;
    role: number;
    expiresAt?: Date;
    maxUses?: number;
  }): Promise<WorldInvite> {
    try {
      const created = new this.model({
        ...data,
        status: 'pending',
        usedCount: 0,
      });
      const saved = await created.save();
      return this.toEntity(
        saved.toObject() as unknown as Record<string, unknown>,
      );
    } catch (e: unknown) {
      // Partial unique index (worldId, invitedUserId | pending, user).
      if (isDuplicateKey(e)) throw new ConflictException('PENDING_INVITE');
      throw e;
    }
  }

  async findByToken(token: string): Promise<WorldInvite | null> {
    const doc = await this.model.findOne({ token }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findActiveByWorld(worldId: string): Promise<WorldInvite[]> {
    const docs = await this.model
      .find({ worldId, status: 'pending' })
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findPendingUserInvite(
    worldId: string,
    invitedUserId: string,
  ): Promise<WorldInvite | null> {
    const doc = await this.model
      .findOne({ worldId, invitedUserId, kind: 'user', status: 'pending' })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findPendingForUser(invitedUserId: string): Promise<WorldInvite[]> {
    const docs = await this.model
      .find({ invitedUserId, kind: 'user', status: 'pending' })
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countPendingForUser(invitedUserId: string): Promise<number> {
    return this.model
      .countDocuments({ invitedUserId, kind: 'user', status: 'pending' })
      .exec();
  }

  async updateStatus(
    id: string,
    status: WorldInviteStatus,
  ): Promise<WorldInvite | null> {
    return this.update(id, { status });
  }

  async incrementUsedCount(id: string): Promise<WorldInvite | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $inc: { usedCount: 1 } }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  protected toEntity(doc: Record<string, unknown>): WorldInvite {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      kind: doc.kind as WorldInviteKind,
      invitedUserId: doc.invitedUserId as string | undefined,
      token: doc.token as string | undefined,
      createdBy: doc.createdBy as string,
      role: doc.role as number,
      status: doc.status as WorldInviteStatus,
      expiresAt: doc.expiresAt as Date | undefined,
      maxUses: doc.maxUses as number | undefined,
      usedCount: (doc.usedCount as number) ?? 0,
      createdAt: doc.createdAt as Date | undefined,
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
