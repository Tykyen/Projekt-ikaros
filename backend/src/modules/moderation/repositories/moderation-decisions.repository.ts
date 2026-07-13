import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  ModerationAction,
  ReportCategory,
  ReportTargetType,
} from '../enums/moderation.enums';
import type { IModerationDecisionsRepository } from '../interfaces/moderation-decisions-repository.interface';
import type { ModerationDecision } from '../interfaces/moderation-entities.interface';
import { ModerationDecisionSchemaClass } from '../schemas/moderation-decision.schema';

/** Spec 20B — Mongo implementace repo `moderation_decisions` (moderační log). */
@Injectable()
export class MongoModerationDecisionsRepository implements IModerationDecisionsRepository {
  constructor(
    @InjectModel(ModerationDecisionSchemaClass.name)
    private readonly model: Model<ModerationDecisionSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): ModerationDecision {
    return {
      id: String((doc._id as { toString(): string }).toString()),
      reportId: doc.reportId as string | undefined,
      targetType: doc.targetType as ReportTargetType,
      targetId: doc.targetId as string,
      targetSnapshot: doc.targetSnapshot as string,
      worldId: doc.worldId as string | undefined,
      targetAuthorId: doc.targetAuthorId as string | undefined,
      targetUrl: doc.targetUrl as string | undefined,
      action: doc.action as ModerationAction,
      reasonText: doc.reasonText as string,
      category: doc.category as ReportCategory | undefined,
      legalOrPolicyGround: doc.legalOrPolicyGround as string,
      automated: (doc.automated as boolean) ?? false,
      moderatorId: doc.moderatorId as string,
      moderatorName: doc.moderatorName as string,
      createdAtUtc: doc.createdAtUtc as Date,
      authorNotifiedAt: doc.authorNotifiedAt as Date | undefined,
      reporterNotifiedAt: doc.reporterNotifiedAt as Date | undefined,
      appealId: doc.appealId as string | undefined,
    };
  }

  async create(
    data: Omit<ModerationDecision, 'id'>,
  ): Promise<ModerationDecision> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<ModerationDecision | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ModerationDecision[]> {
    const docs = await this.model
      .find({ targetType, targetId })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByAuthor(authorId: string): Promise<ModerationDecision[]> {
    const docs = await this.model
      .find({ targetAuthorId: authorId })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findAll(offset: number, limit: number): Promise<ModerationDecision[]> {
    const docs = await this.model
      .find()
      .sort({ createdAtUtc: -1, _id: -1 })
      .skip(Math.max(0, offset))
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments().exec();
  }

  async markAuthorNotified(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, { authorNotifiedAt: new Date() })
      .exec();
  }

  async markReporterNotified(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, { reporterNotifiedAt: new Date() })
      .exec();
  }

  async setAppealId(decisionId: string, appealId: string): Promise<void> {
    await this.model.findByIdAndUpdate(decisionId, { appealId }).exec();
  }
}
