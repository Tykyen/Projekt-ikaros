import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnonBanSchemaClass, AnonBanDocument } from './schemas/anon-ban.schema';

/**
 * Spec 15.8 — správa banů hostů (anonymů) v Hospodě. Ban váže na `anonId`.
 */
@Injectable()
export class AnonBanService {
  constructor(
    @InjectModel(AnonBanSchemaClass.name)
    private readonly model: Model<AnonBanDocument>,
  ) {}

  async isBanned(anonId: string): Promise<boolean> {
    const hit = await this.model.findOne({ anonId }).lean().exec();
    return !!hit;
  }

  /** Idempotentní — opakovaný ban stejného anonId nehází E11000 (upsert). */
  async ban(anonId: string, bannedBy: string): Promise<void> {
    await this.model
      .updateOne(
        { anonId },
        { $setOnInsert: { anonId, bannedBy } },
        { upsert: true },
      )
      .exec();
  }

  async unban(anonId: string): Promise<void> {
    await this.model.deleteOne({ anonId }).exec();
  }
}
