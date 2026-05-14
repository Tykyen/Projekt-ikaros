import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SecurityTokenSchemaClass } from '../schemas/security-token.schema';
import type { ISecurityTokensRepository } from '../interfaces/security-tokens-repository.interface';
import type { CreateSecurityTokenInput } from '../interfaces/security-tokens-repository.interface';
import type {
  SecurityToken,
  SecurityTokenType,
} from '../interfaces/security-token.interface';

@Injectable()
export class MongoSecurityTokensRepository implements ISecurityTokensRepository {
  constructor(
    @InjectModel(SecurityTokenSchemaClass.name)
    private readonly model: Model<SecurityTokenSchemaClass>,
  ) {}

  async save(input: CreateSecurityTokenInput): Promise<SecurityToken> {
    const doc = await this.model.create(input);
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findByHash(tokenHash: string): Promise<SecurityToken | null> {
    const doc = await this.model.findOne({ tokenHash }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * Atomický update — usedAt se nastaví jen pokud byl ještě null (anti-race).
   * Mongo `findOneAndUpdate` je atomic.
   */
  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.model
      .findOneAndUpdate({ _id: id, usedAt: { $exists: false } }, { usedAt })
      .exec();
  }

  async invalidateAllByUserAndType(
    userId: string,
    type: SecurityTokenType,
  ): Promise<void> {
    const now = new Date();
    await this.model
      .updateMany({ userId, type, usedAt: { $exists: false } }, { usedAt: now })
      .exec();
  }

  private toEntity(doc: Record<string, unknown>): SecurityToken {
    return {
      id: String(doc._id),
      tokenHash: doc.tokenHash as string,
      userId: doc.userId as string,
      type: doc.type as SecurityTokenType,
      meta: doc.meta as Record<string, unknown> | undefined,
      expiresAt: doc.expiresAt as Date,
      usedAt: doc.usedAt as Date | undefined,
      createdAt: doc.createdAt as Date,
    };
  }
}
