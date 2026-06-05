import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../interfaces/user.interface';
import type {
  AdminPermissions,
  DeletionPromotion,
} from '../interfaces/user.interface';

export type UserDocument = HydratedDocument<UserSchemaClass>;

@Schema({ timestamps: true, collection: 'users' })
export class UserSchemaClass {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true, unique: true })
  username: string;

  // Lowercase derivát username pro case-insensitive lookup. Derivuje se v repository při save.
  // Existující záznamy jsou backfillovány při bootu (UsersService.onModuleInit).
  // Není required (kvůli pre-migration záznamům); backfill garantuje že po onModuleInit je vždy nastaveno.
  @Prop({ unique: true, sparse: true, lowercase: true, index: true })
  usernameLower?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: Number, enum: UserRole, default: UserRole.Hrac })
  role: UserRole;

  @Prop() displayName?: string;
  @Prop() avatarUrl?: string;
  @Prop() profileImageUrl?: string;
  @Prop() characterPath?: string;

  @Prop({ type: Object, default: {} }) themeSettings: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) chatPreferences: Record<string, unknown>;
  @Prop({ type: [String], default: [] }) favoriteDiscussionIds: string[];
  // 3.4 — diskuze, které uživatel lajkl (zdroj pravdy pro likeCount toggle)
  @Prop({ type: [String], default: [] }) likedDiscussionIds: string[];
  // 3.7 — oblíbené (záložky) napříč globálním obsahem
  @Prop({ type: [String], default: [] }) favoriteArticleIds: string[];
  @Prop({ type: [String], default: [] }) favoriteGalleryIds: string[];
  // 3.7 — připnuté (podmnožina oblíbených, sidebar, max 5/typ)
  @Prop({ type: [String], default: [] }) pinnedDiscussionIds: string[];
  @Prop({ type: [String], default: [] }) pinnedArticleIds: string[];
  @Prop({ type: [String], default: [] }) pinnedGalleryIds: string[];

  @Prop({ default: false }) isOnline: boolean;
  @Prop({ default: Date.now }) lastSeenAt: Date;

  // SP0 rozšíření (2026-05-14):
  @Prop({ default: false }) isDeleted?: boolean;
  @Prop({ type: Date }) deletionRequestedAt?: Date;
  @Prop({ type: Date }) deletedAt?: Date; // N-6b (1.3c) — hard-cleanup timestamp
  @Prop() deletionReason?: string;

  @Prop({ type: Date }) bannedAt?: Date;
  @Prop({ type: Date }) bannedUntil?: Date;
  @Prop() banReason?: string;

  @Prop({
    type: {
      canManageAdmins: { type: Boolean, default: false },
      canModerateContent: { type: Boolean, default: false },
      canEditPlatformPages: { type: Boolean, default: false },
    },
    _id: false,
  })
  adminPermissions?: AdminPermissions;

  @Prop({ type: String, enum: ['male', 'female', 'being'], default: 'male' })
  defaultAvatarType?: string;
  @Prop({ type: Date }) usernameChangedAt?: Date;

  // SP2 rozšíření (2026-05-14):
  @Prop({ default: false }) emailVerified?: boolean;
  @Prop({ type: Date }) emailVerifiedAt?: Date;
  @Prop() deletionRequestedBy?: string;

  // F-03 (D-010 GDPR) — doklad souhlasu s podmínkami při registraci.
  // `acceptedTermsAt` = kdy uživatel odsouhlasil, `termsVersion` = verze podmínek
  // platná v ten okamžik (server-side konstanta). Retenci souhlasu řeší provozovatel.
  @Prop({ type: Date }) acceptedTermsAt?: Date;
  @Prop() termsVersion?: string;

  @Prop({
    type: [
      {
        worldId: { type: String, required: true },
        worldName: { type: String, required: true },
        worldSlug: { type: String, required: true },
        promotedUserId: { type: String, required: true },
        promotedUsername: { type: String, required: true },
        _id: false,
      },
    ],
    default: [],
  })
  deletionPromotions?: DeletionPromotion[];

  // SP3 / D-052 (2026-05-14):
  @Prop({ default: false }) hiddenPresence?: boolean;

  // D-045 (2026-05-23) — privacy „skrýt mě v adresáři uživatelů".
  // True = uživatel se nevyfiltruje v `findPublicPaginated`. Admin/Superadmin
  // vidí všechny vč. skrytých (audit). Self je vždy viditelný sám sobě.
  @Prop({ default: false }) hiddenInDirectory?: boolean;

  // SP4 (2026-05-14):
  @Prop() bannedBy?: string;

  // 3.5 / D-057 (2026-05-15) — friend-only privacy:
  @Prop({ type: String, enum: ['public', 'friends'], default: 'public' })
  profileVisibility?: 'public' | 'friends';

  // D-072 (2026-05-16) — barva chatu uživatele (hex #RRGGBB).
  // Default bílá; existující dokumenty bez pole sklápí toEntity mapper.
  @Prop({ type: String, default: '#FFFFFF' }) chatColor: string;

  // 1.3a BE catch-up (2026-05-16) — profilová pole; FE je čekal, BE nikdy nevznikl.
  @Prop() city?: string;
  @Prop() bio?: string;
  @Prop() characterName?: string;
  @Prop() characterBio?: string;
  @Prop() characterAvatarUrl?: string;
  @Prop() themeId?: string;
  @Prop({ type: Date }) lastLoginAt?: Date;

  // 8.3 / D-074 (2026-05-23) — oblíbené postavy per svět. Mapa worldId → slug[],
  // sdíleno napříč zařízeními (nahrazuje localStorage v useFavoriteCharacters).
  // Mongo Map; pre-existing dokumenty backfilluje toEntity na `{}`.
  @Prop({ type: Map, of: [String], default: {} })
  favoriteCharacters: Map<string, string[]>;
}

export const UserSchema = SchemaFactory.createForClass(UserSchemaClass);
UserSchema.index({ role: 1 });
UserSchema.index({ lastSeenAt: 1 });
UserSchema.index({ bannedUntil: 1 }, { sparse: true });
// D-044 — Mongo $text index pro public adresář (fulltext nad usernameLower + displayName).
// Aktivuje se v `MongoUsersRepository.findPublicPaginated` při dotazu s parametrem `useTextSearch: true`,
// jinak fallback na $regex (rychlejší pro malé sety, viditelné `usernameLower` substring search).
UserSchema.index({ usernameLower: 'text', displayName: 'text' });
