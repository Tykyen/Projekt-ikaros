import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  ContentLicense,
  ContentLicenseChange,
  CreateContentLicenseInput,
  IContentLicensesRepository,
  LicenseAiOrigin,
  LicenseMode,
  LicenseReviewStatus,
  ThirdPartyStatus,
} from '../interfaces/content-license.interface';
import { ContentLicenseSchemaClass } from '../schemas/content-license.schema';

/**
 * Spec 20D (D4) — Mongo repo licenční karty s verzováním.
 *
 * `createNewVersion` je append-only: přečte poslední snapshot, aplikuje změny
 * a vloží NOVÝ dokument s vyšším `versionId`. Starou verzi nikdy nemění, takže
 * historie režimů zůstává auditovatelná (obrana + genealogie pro 21.5).
 */
@Injectable()
export class MongoContentLicensesRepository implements IContentLicensesRepository {
  constructor(
    @InjectModel(ContentLicenseSchemaClass.name)
    private readonly model: Model<ContentLicenseSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): ContentLicense {
    return {
      id: String(doc._id),
      contentId: doc.contentId as string,
      versionId: (doc.versionId as string) ?? '1',
      ownerUserId: doc.ownerUserId as string,
      publicAuthorName: (doc.publicAuthorName as string) ?? '',
      licenseMode: (doc.licenseMode as LicenseMode) ?? 'private',
      cloneAllowed: (doc.cloneAllowed as boolean) ?? false,
      derivativesAllowed: (doc.derivativesAllowed as boolean) ?? false,
      exportAllowed: (doc.exportAllowed as boolean) ?? false,
      aiOrigin: (doc.aiOrigin as LicenseAiOrigin) ?? 'A6',
      thirdPartyStatus: (doc.thirdPartyStatus as ThirdPartyStatus) ?? 'unknown',
      rpgSystemId: doc.rpgSystemId as string | undefined,
      attributionRequired: (doc.attributionRequired as boolean) ?? false,
      sourceUrlOrNote: doc.sourceUrlOrNote as string | undefined,
      reviewStatus: (doc.reviewStatus as LicenseReviewStatus) ?? 'pending',
      acceptedTermsVersion: (doc.acceptedTermsVersion as string) ?? '',
      parentContentId: doc.parentContentId as string | undefined,
      createdAtUtc: doc.createdAtUtc as Date,
    };
  }

  async create(data: CreateContentLicenseInput): Promise<ContentLicense> {
    const doc = await this.model.create({ ...data, versionId: '1' });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async createNewVersion(
    contentId: string,
    change: ContentLicenseChange,
  ): Promise<ContentLicense | null> {
    const latest = await this.findLatest(contentId);
    if (!latest) return null;
    const count = await this.model.countDocuments({ contentId }).exec();
    const nextVersionId = String(count + 1);
    // Snapshot minulé verze bez identity/verzních polí; změny mají přednost.
    const {
      id: _id,
      versionId: _versionId,
      createdAtUtc: _createdAtUtc,
      ...carried
    } = latest;
    void _id;
    void _versionId;
    void _createdAtUtc;
    const doc = await this.model.create({
      ...carried,
      ...change,
      contentId,
      versionId: nextVersionId,
    });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findLatest(contentId: string): Promise<ContentLicense | null> {
    const doc = await this.model
      .find({ contentId })
      .sort({ createdAtUtc: -1, versionId: -1 })
      .limit(1)
      .lean()
      .exec();
    return doc.length > 0
      ? this.toEntity(doc[0] as unknown as Record<string, unknown>)
      : null;
  }

  async findVersions(contentId: string): Promise<ContentLicense[]> {
    const docs = await this.model
      .find({ contentId })
      .sort({ createdAtUtc: 1, versionId: 1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<ContentLicense | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }
}
