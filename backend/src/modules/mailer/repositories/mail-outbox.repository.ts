import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailOutboxSchemaClass } from '../schemas/mail-outbox.schema';
import type {
  CreateMailOutboxInput,
  IMailOutboxRepository,
  MailOutboxEntry,
  MailOutboxStatus,
} from '../interfaces/mail-outbox.interface';
import type { MailerTemplate } from '../interfaces/mailer-provider.interface';

@Injectable()
export class MongoMailOutboxRepository implements IMailOutboxRepository {
  constructor(
    @InjectModel(MailOutboxSchemaClass.name)
    private readonly model: Model<MailOutboxSchemaClass>,
  ) {}

  async create(input: CreateMailOutboxInput): Promise<MailOutboxEntry> {
    const doc = await this.model.create({
      ...input,
      status: 'pending',
      attempts: 0,
    });
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  /**
   * Atomický claim (findOneAndUpdate) — vyzvedne due pending mail a posune mu
   * `nextAttemptAt` o lease dopředu. `new: false` → vrací stav PŘED updatem
   * (kvůli `attempts`). Crash uprostřed odeslání → mail se po lease vrátí.
   */
  async claimDue(now: Date, leaseMs: number): Promise<MailOutboxEntry | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { $set: { nextAttemptAt: new Date(now.getTime() + leaseMs) } },
        { sort: { priority: 1, createdAt: 1 }, new: false },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async markSent(
    id: string,
    sentAt: Date,
    smtpResponse?: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            status: 'sent',
            sentAt,
            ...(smtpResponse ? { smtpResponse } : {}),
          },
          $inc: { attempts: 1 },
        },
      )
      .exec();
  }

  async scheduleRetry(
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    lastError: string,
  ): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { attempts, nextAttemptAt, lastError } })
      .exec();
  }

  async markFailed(
    id: string,
    attempts: number,
    lastError: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        { $set: { status: 'failed', attempts, lastError } },
      )
      .exec();
  }

  async defer(id: string, nextAttemptAt: Date): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { nextAttemptAt } }).exec();
  }

  private toEntity(doc: Record<string, unknown>): MailOutboxEntry {
    return {
      id: String(doc._id),
      to: doc.to as string,
      subject: doc.subject as string,
      text: doc.text as string,
      html: doc.html as string,
      category: doc.category as MailerTemplate,
      priority: doc.priority as number,
      status: doc.status as MailOutboxStatus,
      attempts: doc.attempts as number,
      nextAttemptAt: doc.nextAttemptAt as Date,
      sentAt: doc.sentAt as Date | undefined,
      lastError: doc.lastError as string | undefined,
      smtpResponse: doc.smtpResponse as string | undefined,
      createdAt: doc.createdAt as Date,
    };
  }
}
