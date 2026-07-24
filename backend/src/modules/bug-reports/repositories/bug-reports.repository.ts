import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IBugReportsRepository } from '../interfaces/bug-reports-repository.interface';
import type {
  BugReport,
  BugReportContext,
  BugReportStatus,
} from '../interfaces/bug-report.interface';
import { BugReportSchemaClass } from '../schemas/bug-report.schema';

/** Spec 25.1 — Mongo implementace repo `bug_reports` (pattern content-reports). */
@Injectable()
export class MongoBugReportsRepository implements IBugReportsRepository {
  constructor(
    @InjectModel(BugReportSchemaClass.name)
    private readonly model: Model<BugReportSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): BugReport {
    return {
      id: String((doc._id as { toString(): string }).toString()),
      text: doc.text as string,
      email: doc.email as string | undefined,
      context: doc.context as BugReportContext,
      reporterId: doc.reporterId as string | undefined,
      status: (doc.status as BugReportStatus) ?? 'new',
      createdAtUtc: doc.createdAtUtc as Date,
      resolvedByUserId: doc.resolvedByUserId as string | undefined,
      resolvedAtUtc: doc.resolvedAtUtc as Date | undefined,
    };
  }

  async create(data: Omit<BugReport, 'id'>): Promise<BugReport> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<BugReport | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByStatus(
    statuses: BugReportStatus[],
    skip: number,
    limit: number,
  ): Promise<BugReport[]> {
    const docs = await this.model
      .find({ status: { $in: statuses } })
      .sort({ createdAtUtc: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countByStatus(statuses: BugReportStatus[]): Promise<number> {
    return this.model.countDocuments({ status: { $in: statuses } }).exec();
  }

  async markResolved(id: string, userId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        status: 'resolved',
        resolvedByUserId: userId,
        resolvedAtUtc: new Date(),
      })
      .exec();
  }
}
