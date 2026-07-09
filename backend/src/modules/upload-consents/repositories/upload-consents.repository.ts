import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  IUploadConsentsRepository,
  UploadConsent,
  UploadConsentAction,
  UploadConsentTargetType,
} from '../interfaces/upload-consent.interface';
import { UploadConsentSchemaClass } from '../schemas/upload-consent.schema';

/** Spec 20D (D3) — Mongo implementace audit logu `upload_consents`. */
@Injectable()
export class MongoUploadConsentsRepository implements IUploadConsentsRepository {
  constructor(
    @InjectModel(UploadConsentSchemaClass.name)
    private readonly model: Model<UploadConsentSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): UploadConsent {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      targetType: (doc.targetType as UploadConsentTargetType) ?? 'gallery',
      targetId: doc.targetId as string | undefined,
      action: (doc.action as UploadConsentAction) ?? 'upload',
      rightsDeclared: true,
      aiDeclared: (doc.aiDeclared as boolean) ?? false,
      termsVersion: (doc.termsVersion as string) ?? '',
      ip: doc.ip as string | undefined,
      createdAtUtc: doc.createdAtUtc as Date,
    };
  }

  async create(data: Omit<UploadConsent, 'id'>): Promise<UploadConsent> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findByUser(userId: string): Promise<UploadConsent[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByTarget(
    targetType: UploadConsentTargetType,
    targetId: string,
  ): Promise<UploadConsent[]> {
    const docs = await this.model
      .find({ targetType, targetId })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }
}
