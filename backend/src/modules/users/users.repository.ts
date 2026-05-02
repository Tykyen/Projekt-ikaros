import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../database/mongo/base-mongo.repository';
import { UserSchemaClass } from './schemas/user.schema';
import { User, UserRole } from './interfaces/user.interface';
import { IUsersRepository } from './interfaces/users-repository.interface';

@Injectable()
export class MongoUsersRepository
  extends BaseMongoRepository<User>
  implements IUsersRepository
{
  constructor(
    @InjectModel(UserSchemaClass.name)
    model: Model<UserSchemaClass>,
  ) {
    super(model as never);
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await this.model.findOne({ email: email.toLowerCase() }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const doc = await this.model.findOne({ username }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findFirstByRole(role: UserRole): Promise<User | null> {
    const doc = await this.model.findOne({ role }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, { lastSeenAt: new Date() })
      .exec();
  }

  protected toEntity(doc: Record<string, unknown>): User {
    return {
      id: String(doc._id),
      email: doc.email as string,
      username: doc.username as string,
      passwordHash: doc.passwordHash as string,
      role: doc.role as number,
      displayName: doc.displayName as string | undefined,
      avatarUrl: doc.avatarUrl as string | undefined,
      characterPath: doc.characterPath as string | undefined,
      ikarosSkin: doc.ikarosSkin as string | undefined,
      akj: (doc.akj as boolean) ?? false,
      themeSettings: (doc.themeSettings as Record<string, unknown>) ?? {},
      chatPreferences: (doc.chatPreferences as Record<string, unknown>) ?? {},
      isOnline: (doc.isOnline as boolean) ?? false,
      lastSeenAt: doc.lastSeenAt as Date,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
