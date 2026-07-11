import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ReportTargetType } from '../enums/moderation.enums';
import type { IContentReportsRepository } from '../interfaces/content-reports-repository.interface';
import type {
  ContentReport,
  ContentReportStatus,
} from '../interfaces/moderation-entities.interface';
import { ContentReportSchemaClass } from '../schemas/content-report.schema';

/** Spec 20B — Mongo implementace repo `content_reports` (pattern discussion repo). */
@Injectable()
export class MongoContentReportsRepository implements IContentReportsRepository {
  constructor(
    @InjectModel(ContentReportSchemaClass.name)
    private readonly model: Model<ContentReportSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): ContentReport {
    return {
      id: String((doc._id as { toString(): string }).toString()),
      targetType: doc.targetType as ReportTargetType,
      targetId: doc.targetId as string,
      targetUrl: doc.targetUrl as string | undefined,
      worldId: doc.worldId as string | undefined,
      targetSnapshot: doc.targetSnapshot as string,
      targetAuthorId: doc.targetAuthorId as string | undefined,
      targetAuthorName: doc.targetAuthorName as string,
      category: doc.category as ContentReport['category'],
      reason: doc.reason as string,
      reporterId: doc.reporterId as string | undefined,
      reporterName: doc.reporterName as string | undefined,
      reporterEmail: doc.reporterEmail as string | undefined,
      goodFaith: (doc.goodFaith as boolean) ?? false,
      evidence: doc.evidence as string | undefined,
      notifyMe: (doc.notifyMe as boolean) ?? false,
      anonymous: (doc.anonymous as boolean) ?? false,
      status: (doc.status as ContentReportStatus) ?? 'pending',
      createdAtUtc: doc.createdAtUtc as Date,
      ackSentAt: doc.ackSentAt as Date | undefined,
      resolvedByModeratorId: doc.resolvedByModeratorId as string | undefined,
      resolvedAtUtc: doc.resolvedAtUtc as Date | undefined,
    };
  }

  async create(data: Omit<ContentReport, 'id'>): Promise<ContentReport> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<ContentReport | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByStatus(
    statuses: ContentReportStatus[],
    skip: number,
    limit: number,
  ): Promise<ContentReport[]> {
    const docs = await this.model
      .find({ status: { $in: statuses } })
      .sort({ createdAtUtc: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countByStatus(statuses: ContentReportStatus[]): Promise<number> {
    return this.model.countDocuments({ status: { $in: statuses } }).exec();
  }

  async markResolved(id: string, moderatorId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        status: 'resolved',
        resolvedByModeratorId: moderatorId,
        resolvedAtUtc: new Date(),
      })
      .exec();
  }

  async markAckSent(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { ackSentAt: new Date() }).exec();
  }

  async findByReporter(reporterId: string): Promise<ContentReport[]> {
    const docs = await this.model
      .find({ reporterId })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ContentReport[]> {
    const docs = await this.model
      .find({ targetType, targetId })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async existsPendingByReporterAndTarget(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<boolean> {
    const count = await this.model
      .countDocuments({ reporterId, targetType, targetId, status: 'pending' })
      .exec();
    return count > 0;
  }
}
