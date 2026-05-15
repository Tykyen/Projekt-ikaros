import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosDiscussionReportsRepository } from '../interfaces/ikaros-discussion-reports-repository.interface';
import type { IkarosDiscussionReport } from '../interfaces/ikaros-discussion.interface';
import { IkarosDiscussionReportSchemaClass } from '../schemas/ikaros-discussion-report.schema';

@Injectable()
export class MongoIkarosDiscussionReportsRepository implements IIkarosDiscussionReportsRepository {
  constructor(
    @InjectModel(IkarosDiscussionReportSchemaClass.name)
    private readonly model: Model<IkarosDiscussionReportSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): IkarosDiscussionReport {
    return {
      id: String((doc._id as { toString(): string }).toString()),
      discussionId: doc.discussionId as string,
      discussionTitle: doc.discussionTitle as string,
      postId: doc.postId as string,
      postContentSnapshot: doc.postContentSnapshot as string,
      postAuthorName: doc.postAuthorName as string,
      reporterId: doc.reporterId as string,
      reporterName: doc.reporterName as string,
      reason: doc.reason as string,
      createdAtUtc: doc.createdAtUtc as Date,
      resolved: (doc.resolved as boolean) ?? false,
    };
  }

  async create(
    data: Omit<IkarosDiscussionReport, 'id'>,
  ): Promise<IkarosDiscussionReport> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<IkarosDiscussionReport | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findUnresolved(
    skip: number,
    limit: number,
  ): Promise<IkarosDiscussionReport[]> {
    const docs = await this.model
      .find({ resolved: false })
      .sort({ createdAtUtc: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countUnresolved(): Promise<number> {
    return this.model.countDocuments({ resolved: false }).exec();
  }

  async markResolved(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { resolved: true }).exec();
  }
}
