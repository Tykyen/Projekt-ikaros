import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PushSubscriptionSchemaClass } from '../schemas/push-subscription.schema';
import type { PushSubscription } from '../interfaces/push-subscription.interface';
import type { IPushSubscriptionRepository } from '../interfaces/push-subscription-repository.interface';

/**
 * Pokud `findAll` vrátí víc subscription než tento threshold, emit warning.
 * `notifyAll` ji volá pro broadcast push notifikace — limit by rozbil funkci,
 * ale loud signál nás upozorní, že nastal čas na batch/stream pattern.
 */
const SCALE_WARNING_THRESHOLD = 1_000;

@Injectable()
export class MongoPushSubscriptionRepository implements IPushSubscriptionRepository {
  private readonly logger = new Logger(MongoPushSubscriptionRepository.name);

  constructor(
    @InjectModel(PushSubscriptionSchemaClass.name)
    private readonly model: Model<PushSubscriptionSchemaClass>,
  ) {}

  async findByUserId(userId: string): Promise<PushSubscription[]> {
    const docs = await this.model.find({ userId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findAll(): Promise<PushSubscription[]> {
    const docs = await this.model.find().lean().exec();
    if (docs.length > SCALE_WARNING_THRESHOLD) {
      this.logger.warn(
        `findAll vrátil ${docs.length} subscriptions — překročen práh ${SCALE_WARNING_THRESHOLD}. Zvážit batch/stream pattern v notifyAll.`,
      );
    }
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async upsertByEndpoint(
    data: Omit<PushSubscription, 'id' | 'createdAt'>,
  ): Promise<PushSubscription> {
    const set: Record<string, unknown> = {
      userId: data.userId,
      p256dh: data.p256dh,
      auth: data.auth,
      lastUsedAt: data.lastUsedAt,
    };
    // undefined by Mongo přepsalo na null — nastavíme jen když UA dorazil.
    if (data.userAgent !== undefined) set.userAgent = data.userAgent;
    const doc = await this.model
      .findOneAndUpdate(
        { endpoint: data.endpoint },
        { $set: set },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async deleteByEndpoint(endpoint: string, userId: string): Promise<boolean> {
    const result = await this.model.deleteOne({ endpoint, userId }).exec();
    return result.deletedCount > 0;
  }

  async deleteByEndpointOnly(endpoint: string): Promise<void> {
    await this.model.deleteOne({ endpoint }).exec();
  }

  async deleteByIdAndUser(id: string, userId: string): Promise<boolean> {
    const result = await this.model.deleteOne({ _id: id, userId }).exec();
    return result.deletedCount > 0;
  }

  private toEntity(doc: Record<string, unknown>): PushSubscription {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      endpoint: doc.endpoint as string,
      p256dh: doc.p256dh as string,
      auth: doc.auth as string,
      userAgent: doc.userAgent as string | undefined,
      createdAt: doc.createdAt as Date,
      // Staré záznamy bez lastUsedAt → fallback na createdAt.
      lastUsedAt: (doc.lastUsedAt ?? doc.createdAt) as Date,
    };
  }
}
