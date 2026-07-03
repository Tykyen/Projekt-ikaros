import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformDocumentSchemaClass } from './schemas/platform-document.schema';
import type { PlatformDocument } from './interfaces/platform-document.interface';
import { UploadService } from '../upload/upload.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

/** 20.5 — sklad sdílených PDF admin chatu. */
@Injectable()
export class PlatformDocumentsService {
  constructor(
    @InjectModel(PlatformDocumentSchemaClass.name)
    private readonly model: Model<PlatformDocumentSchemaClass>,
    private readonly uploadService: UploadService,
  ) {}

  private toEntity(doc: Record<string, unknown>): PlatformDocument {
    return {
      id: String(doc._id),
      filename: doc.filename as string,
      url: doc.url as string,
      publicId: doc.publicId as string,
      mimeType: (doc.mimeType as string) ?? 'application/pdf',
      sizeBytes: (doc.sizeBytes as number) ?? 0,
      uploaderId: doc.uploaderId as string,
      uploaderName: doc.uploaderName as string,
      createdAt: doc.createdAt as Date,
    };
  }

  async list(): Promise<PlatformDocument[]> {
    const docs = await this.model.find().sort({ createdAt: -1 }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async upload(
    file: Express.Multer.File,
    user: RequestUser,
  ): Promise<PlatformDocument> {
    const attachment = await this.uploadService.uploadPlatformDocument(file);
    const created = await this.model.create({
      filename: attachment.filename,
      url: attachment.url,
      publicId: attachment.publicId,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.size,
      uploaderId: user.id,
      uploaderName: user.username,
    });
    return this.toEntity(
      created.toObject() as unknown as Record<string, unknown>,
    );
  }

  /** Smazat smí Superadmin nebo ten, kdo dokument nahrál. */
  async delete(id: string, user: RequestUser): Promise<void> {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException({
        code: 'PLATFORM_DOC_NOT_FOUND',
        message: 'Dokument neexistuje',
      });
    }
    const uploaderId = String(
      (doc as unknown as Record<string, unknown>).uploaderId,
    );
    if (user.role !== UserRole.Superadmin && uploaderId !== user.id) {
      throw new ForbiddenException({
        code: 'PLATFORM_DOC_FORBIDDEN',
        message: 'Smazat může jen nahravatel nebo superadmin',
      });
    }
    await this.model.findByIdAndDelete(id).exec();
  }
}
