import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminAuditLogSchemaClass } from '../schemas/admin-audit-log.schema';
import type {
  IAdminAuditLogRepository,
  RecordAuditInput,
  ListAuditOpts,
  AdminAuditLogEntry,
  AdminAuditAction,
  AuditTargetType,
} from '../interfaces/admin-audit-log.interface';

@Injectable()
export class MongoAdminAuditLogRepository implements IAdminAuditLogRepository {
  constructor(
    @InjectModel(AdminAuditLogSchemaClass.name)
    private readonly model: Model<AdminAuditLogSchemaClass>,
  ) {}

  async record(input: RecordAuditInput): Promise<void> {
    await this.model.create({ targetType: 'user', ...input });
  }

  async listPaginated(
    opts: ListAuditOpts,
  ): Promise<{ items: AdminAuditLogEntry[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (opts.actorId) filter.actorId = opts.actorId;
    if (opts.targetId) filter.targetId = opts.targetId;
    if (opts.action) filter.action = opts.action;
    if (opts.targetType) filter.targetType = opts.targetType;

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

  private toEntity(doc: Record<string, unknown>): AdminAuditLogEntry {
    return {
      id: String(doc._id),
      actorId: doc.actorId as string,
      actorUsername: doc.actorUsername as string,
      targetId: doc.targetId as string,
      targetUsername: doc.targetUsername as string,
      targetType: (doc.targetType as AuditTargetType | undefined) ?? 'user',
      action: doc.action as AdminAuditAction,
      before: (doc.before as Record<string, unknown> | null) ?? null,
      after: (doc.after as Record<string, unknown> | null) ?? null,
      reason: (doc.reason as string | null) ?? null,
      createdAt: doc.createdAt as Date,
    };
  }
}
