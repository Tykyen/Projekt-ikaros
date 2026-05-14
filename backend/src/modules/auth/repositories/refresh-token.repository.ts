import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RefreshTokenSchemaClass } from '../schemas/refresh-token.schema';
import { RefreshToken } from '../interfaces/refresh-token.interface';
import { IRefreshTokenRepository } from '../interfaces/refresh-token-repository.interface';

// Neextenduje BaseMongoRepository — refresh tokeny nemají CRUD operace,
// pouze save + lookup + revokace. TTL cleanup zajišťuje MongoDB přes
// expiresAt index v schema.
@Injectable()
export class MongoRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    @InjectModel(RefreshTokenSchemaClass.name)
    private readonly model: Model<RefreshTokenSchemaClass>,
  ) {}

  async save(
    token: Omit<RefreshToken, 'createdAt'> & { createdAt?: Date },
  ): Promise<RefreshToken> {
    const doc = await this.model.create(token);
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findByJti(jti: string): Promise<RefreshToken | null> {
    const doc = await this.model.findOne({ jti }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async revokeByJti(jti: string): Promise<void> {
    await this.model.findOneAndUpdate({ jti }, { revoked: true }).exec();
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.model.updateMany({ familyId }, { revoked: true }).exec();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.model.updateMany({ userId }, { revoked: true }).exec();
  }

  private toEntity(doc: Record<string, unknown>): RefreshToken {
    return {
      jti: doc.jti as string,
      userId: doc.userId as string,
      familyId: doc.familyId as string,
      expiresAt: doc.expiresAt as Date,
      revoked: (doc.revoked as boolean) ?? false,
      createdAt: doc.createdAt as Date,
    };
  }
}
