import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../database/mongo/base-mongo.repository';
import { UserSchemaClass } from './schemas/user.schema';
import { User, UserRole } from './interfaces/user.interface';
import type {
  IUsersRepository,
  FindPublicPaginatedOpts,
} from './interfaces/users-repository.interface';

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

  /**
   * D-040 — batch lookup po ObjectId pro tombstone enrichment.
   * Neexistující IDs se prostě vynechají (caller doplní default „smazaný účet" stub).
   */
  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: validIds } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByUsernames(usernames: string[]): Promise<User[]> {
    if (usernames.length === 0) return [];
    const lowers = Array.from(new Set(usernames.map((u) => u.toLowerCase())));
    const docs = await this.model
      .find({ usernameLower: { $in: lowers } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
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

  /**
   * CD-08 (cascade-delete audit) — odeber smazaný page slug ze všech
   * `favoritePageSlugs[worldId]` (jinak mrtvý slug v oblíbených uživatelů).
   */
  async pullFavoritePageSlug(worldId: string, slug: string): Promise<void> {
    await this.model.updateMany(
      {},
      { $pull: { [`favoritePageSlugs.${worldId}`]: slug } },
    );
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

  // 1.3a — zápis při loginu/registraci (≠ lastSeenAt, který se mění s presence).
  async updateLastLogin(id: string, at: Date): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { lastLoginAt: at } })
      .exec();
  }

  async findOnlineSince(since: Date): Promise<string[]> {
    const docs = await this.model
      .find({ lastSeenAt: { $gte: since } }, { _id: 1 })
      .lean()
      .exec();
    return docs.map((d) => String((d as { _id: unknown })._id));
  }

  async countCreatedSince(since: Date): Promise<number> {
    return this.model
      .countDocuments({ createdAt: { $gte: since }, isDeleted: { $ne: true } })
      .exec();
  }

  async countPendingDeletion(): Promise<number> {
    return this.model
      .countDocuments({
        deletionRequestedAt: { $ne: null },
        isDeleted: { $ne: true },
      })
      .exec();
  }

  // 1.3c (N-3) — účty s prošlým 30denním holdem, dosud neanonymizované.
  async findExpiredPendingDeletion(cutoff: Date): Promise<User[]> {
    const docs = await this.model
      .find({
        deletionRequestedAt: { $ne: null, $lt: cutoff },
        isDeleted: { $ne: true },
      })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  // 1.3c (N-3) — nevratná anonymizace. $unset pro PII (update/$set undefined nemaže),
  // $set isDeleted/deletedAt + placeholder email/passwordHash.
  async anonymizeForHardDelete(
    id: string,
    anonymizedEmail: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            email: anonymizedEmail,
            passwordHash: '',
            emailVerified: false,
          },
          // GDPR (spec 1.3c §4.4 ř.42/430) — PII pryč. Avatar pole nullujeme zde,
          // soubory z Cloudinary maže UploadService @OnEvent('user.deletion.hardDeleted').
          // Zachováno: username/usernameLower/displayName/chatColor/defaultAvatarType.
          $unset: {
            bio: '',
            lastLoginAt: '',
            city: '',
            emailVerifiedAt: '',
            avatarUrl: '',
            characterAvatarUrl: '',
            profileImageUrl: '',
          },
        },
      )
      .exec();
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

  async findPublicPaginated(
    opts: FindPublicPaginatedOpts,
  ): Promise<{ items: User[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (!opts.includeDeleted) {
      filter.isDeleted = { $ne: true };
      filter.deletionRequestedAt = { $exists: false };
    }
    // D-045 — pro non-admin requestera skryj uživatele s `hiddenInDirectory: true`.
    if (!opts.includeHidden) {
      filter.hiddenInDirectory = { $ne: true };
    }
    if (opts.q) {
      filter.$or = [
        { username: { $regex: opts.q, $options: 'i' } },
        { displayName: { $regex: opts.q, $options: 'i' } },
      ];
    }

    const sortBy: Record<string, 1 | -1> =
      opts.sort === 'recent'
        ? { lastSeenAt: -1 }
        : opts.sort === 'username'
          ? { usernameLower: 1 }
          : { createdAt: -1 };

    const skip = (opts.page - 1) * opts.limit;
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sortBy)
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

  protected toEntity(doc: Record<string, unknown>): User {
    return {
      id: String(doc._id),
      email: doc.email as string,
      username: doc.username as string,
      passwordHash: doc.passwordHash as string,
      role: doc.role as UserRole,
      displayName: doc.displayName as string | undefined,
      avatarUrl: doc.avatarUrl as string | undefined,
      profileImageUrl: doc.profileImageUrl as string | undefined,
      characterPath: doc.characterPath as string | undefined,
      themeSettings: (doc.themeSettings as Record<string, unknown>) ?? {},
      chatPreferences: (doc.chatPreferences as Record<string, unknown>) ?? {},
      favoriteDiscussionIds: (doc.favoriteDiscussionIds as string[]) ?? [],
      likedDiscussionIds: (doc.likedDiscussionIds as string[]) ?? [],
      // 3.7 — bez tohoto mapování by findById zahazoval favorites/pinned pole
      favoriteArticleIds: (doc.favoriteArticleIds as string[]) ?? [],
      favoriteGalleryIds: (doc.favoriteGalleryIds as string[]) ?? [],
      pinnedDiscussionIds: (doc.pinnedDiscussionIds as string[]) ?? [],
      pinnedArticleIds: (doc.pinnedArticleIds as string[]) ?? [],
      pinnedGalleryIds: (doc.pinnedGalleryIds as string[]) ?? [],
      isOnline: (doc.isOnline as boolean) ?? false,
      lastSeenAt: doc.lastSeenAt as Date,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,

      // SP0/SP2/SP3/SP4 rozšíření — bez nich findById zahazuje tato pole
      // (tombstone hiding, ban check, adminPermissions tiše nefungovaly).
      isDeleted: doc.isDeleted as boolean | undefined,
      deletionRequestedAt: doc.deletionRequestedAt as Date | undefined,
      deletedAt: doc.deletedAt as Date | undefined, // N-6b (1.3c)
      deletionReason: doc.deletionReason as string | undefined,
      bannedAt: doc.bannedAt as Date | undefined,
      bannedUntil: doc.bannedUntil as Date | undefined,
      banReason: doc.banReason as string | undefined,
      bannedBy: doc.bannedBy as string | undefined,
      adminPermissions: doc.adminPermissions as User['adminPermissions'],
      // 1.3a — fallback pro dokumenty bez pole (FE typ ho čeká povinný)
      defaultAvatarType:
        (doc.defaultAvatarType as string | undefined) ?? 'male',
      usernameChangedAt: doc.usernameChangedAt as Date | undefined,
      emailVerified: doc.emailVerified as boolean | undefined,
      emailVerifiedAt: doc.emailVerifiedAt as Date | undefined,
      deletionRequestedBy: doc.deletionRequestedBy as string | undefined,
      deletionPromotions: doc.deletionPromotions as User['deletionPromotions'],
      hiddenPresence: doc.hiddenPresence as boolean | undefined,
      hiddenInDirectory: doc.hiddenInDirectory as boolean | undefined,
      profileVisibility: doc.profileVisibility as User['profileVisibility'],
      // D-072 — fallback pro dokumenty vytvořené před zavedením pole
      chatColor: (doc.chatColor as string | undefined) ?? '#FFFFFF',

      // 1.3a BE catch-up — profilová pole
      city: doc.city as string | undefined,
      bio: doc.bio as string | undefined,
      characterName: doc.characterName as string | undefined,
      characterBio: doc.characterBio as string | undefined,
      characterAvatarUrl: doc.characterAvatarUrl as string | undefined,
      themeId: doc.themeId as string | undefined,
      lastLoginAt: doc.lastLoginAt as Date | undefined,

      // 8.3 / D-074 — oblíbené postavy per svět. Mongo Map → plain object,
      // ať FE dostane standardní JSON `Record<worldId, slug[]>`.
      favoriteCharacters: this.toSlugMapRecord(doc.favoriteCharacters),
      // 5.2-followup — osobní oblíbené stránky per svět (stejný Map→Record mapper).
      favoritePageSlugs: this.toSlugMapRecord(doc.favoritePageSlugs),

      // 14.1 — 2FA / TOTP (bez mapování by /users/me i login zahodily stav 2FA).
      totpEnabled: (doc.totpEnabled as boolean | undefined) ?? false,
      totpSecretEnc: doc.totpSecretEnc as string | null | undefined,
      backupCodeHashes: (doc.backupCodeHashes as string[]) ?? [],
      totpEnabledAt: doc.totpEnabledAt as Date | undefined,
      twoFactorMethod: (doc.twoFactorMethod as string | undefined) ?? 'totp',
    };
  }

  /** Mongo Map | plain object → `Record<worldId, slug[]>` (oblíbené postavy i stránky). */
  private toSlugMapRecord(raw: unknown): Record<string, string[]> {
    if (!raw) return {};
    if (raw instanceof Map) {
      return Object.fromEntries(raw.entries()) as Record<string, string[]>;
    }
    if (typeof raw === 'object') {
      return raw as Record<string, string[]>;
    }
    return {};
  }
}
