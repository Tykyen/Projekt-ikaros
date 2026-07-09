import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IModerationAppealsRepository } from '../interfaces/moderation-appeals-repository.interface';
import type {
  ModerationAppeal,
  ModerationAppealOutcome,
  ModerationAppealStatus,
} from '../interfaces/moderation-entities.interface';
import { ModerationAppealSchemaClass } from '../schemas/moderation-appeal.schema';

/** Spec 20B — Mongo implementace repo `moderation_appeals` (odvolání). */
@Injectable()
export class MongoModerationAppealsRepository implements IModerationAppealsRepository {
  constructor(
    @InjectModel(ModerationAppealSchemaClass.name)
    private readonly model: Model<ModerationAppealSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): ModerationAppeal {
    return {
      id: String((doc._id as { toString(): string }).toString()),
      decisionId: doc.decisionId as string,
      appellantId: doc.appellantId as string,
      appellantName: doc.appellantName as string,
      reason: doc.reason as string,
      status: (doc.status as ModerationAppealStatus) ?? 'pending',
      reviewerId: doc.reviewerId as string | undefined,
      reviewerNote: doc.reviewerNote as string | undefined,
      createdAtUtc: doc.createdAtUtc as Date,
      resolvedAtUtc: doc.resolvedAtUtc as Date | undefined,
    };
  }

  async create(data: Omit<ModerationAppeal, 'id'>): Promise<ModerationAppeal> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<ModerationAppeal | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByDecision(decisionId: string): Promise<ModerationAppeal[]> {
    const docs = await this.model
      .find({ decisionId })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByStatus(
    status: ModerationAppealStatus,
    offset: number,
    limit: number,
  ): Promise<ModerationAppeal[]> {
    const docs = await this.model
      .find({ status })
      .sort({ createdAtUtc: -1 })
      .skip(Math.max(0, offset))
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countByStatus(status: ModerationAppealStatus): Promise<number> {
    return this.model.countDocuments({ status }).exec();
  }

  async markReviewed(
    id: string,
    data: {
      status: ModerationAppealOutcome;
      reviewerId: string;
      reviewerNote: string;
    },
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        status: data.status,
        reviewerId: data.reviewerId,
        reviewerNote: data.reviewerNote,
        resolvedAtUtc: new Date(),
      })
      .exec();
  }
}
