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
    const doc = await this.model
      .findOne({ email: email.toLowerCase() })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    // Case-insensitive lookup přes usernameLower index. Fallback na username field
    // pro pre-migration záznamy (UsersService.onModuleInit backfill je opraví).
    const lower = username.toLowerCase();
    const doc = await this.model
      .findOne({ $or: [{ usernameLower: lower }, { username }] })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async save(user: Partial<User>): Promise<User> {
    const payload: Partial<User> & { usernameLower?: string } = { ...user };
    if (user.username) payload.usernameLower = user.username.toLowerCase();
    return super.save(payload);
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const payload: Partial<User> & { usernameLower?: string } = { ...data };
    if (data.username) payload.usernameLower = data.username.toLowerCase();
    return super.update(id, payload);
  }

  // Migration support — viz UsersService.onModuleInit.
  async findUsernameCaseConflicts(): Promise<
    Array<{ lower: string; usernames: string[] }>
  > {
    const docs = (await this.model
      .find({}, { username: 1 })
      .lean()
      .exec()) as unknown as Array<{ username: string }>;
    const groups = new Map<string, Set<string>>();
    for (const d of docs) {
      const lower = d.username.toLowerCase();
      if (!groups.has(lower)) groups.set(lower, new Set());
      groups.get(lower)!.add(d.username);
    }
    return Array.from(groups.entries())
      .filter(([, set]) => set.size > 1)
      .map(([lower, set]) => ({ lower, usernames: Array.from(set) }));
  }

  async backfillUsernameLower(): Promise<{ updated: number }> {
    const docs = (await this.model
      .find(
        {
          $or: [{ usernameLower: { $exists: false } }, { usernameLower: null }],
        },
        { username: 1 },
      )
      .lean()
      .exec()) as unknown as Array<{ _id: unknown; username: string }>;
    let updated = 0;
    for (const d of docs) {
      await this.model
        .updateOne(
          { _id: d._id as never },
          { $set: { usernameLower: d.username.toLowerCase() } },
        )
        .exec();
      updated++;
    }
    return { updated };
  }

  async findFirstByRole(role: UserRole): Promise<User | null> {
    const doc = await this.model.findOne({ role }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByRoles(roles: UserRole[]): Promise<User[]> {
    const docs = await this.model
      .find({ role: { $in: roles } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { lastSeenAt: new Date() }).exec();
  }

  async findOnlineSince(since: Date): Promise<string[]> {
    const docs = await this.model
      .find({ lastSeenAt: { $gte: since } }, { _id: 1 })
      .lean()
      .exec();
    return docs.map((d) => String((d as { _id: unknown })._id));
  }

  async findAllPaginated(opts: {
    username?: string;
    role?: UserRole;
    page: number;
    limit: number;
  }): Promise<{ items: User[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (opts.role !== undefined) query.role = opts.role;
    if (opts.username)
      query.username = { $regex: opts.username, $options: 'i' };
    const skip = (opts.page - 1) * opts.limit;
    const [docs, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(opts.limit)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return {
      items: docs.map((d) =>
        this.toEntity(d as unknown as Record<string, unknown>),
      ),
      total,
    };
  }

  protected toEntity(doc: Record<string, unknown>): User {
    return {
      id: String(doc._id),
      email: doc.email as string,
      username: doc.username as string,
      passwordHash: doc.passwordHash as string,
      role: doc.role as UserRole,
      displayName: doc.displayName as string | undefined,
      avatarUrl: doc.avatarUrl as string | undefined,
      characterPath: doc.characterPath as string | undefined,
      ikarosSkin: doc.ikarosSkin as string | undefined,
      themeSettings: (doc.themeSettings as Record<string, unknown>) ?? {},
      chatPreferences: (doc.chatPreferences as Record<string, unknown>) ?? {},
      favoriteDiscussionIds: (doc.favoriteDiscussionIds as string[]) ?? [],
      isOnline: (doc.isOnline as boolean) ?? false,
      lastSeenAt: doc.lastSeenAt as Date,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
