import { ConflictException, NotFoundException } from '@nestjs/common';
import type { User } from './interfaces/user.interface';
import type { IUsersRepository } from './interfaces/users-repository.interface';

/**
 * D-NEW-INV-CLEANUP — sdílená logika toggle „oblíbené + připnuté" (3.7).
 * Dřív 3× zkopírovaná v ikaros-articles / ikaros-gallery / ikaros-discussions;
 * lišila se jen jménem polí na User a texty chyb. Service si nechává lookup
 * položky (jiné repo + NOT_FOUND kód) přes `ensureItemExists` callback —
 * pořadí kontrol (user → položka) zůstává zachované.
 */

/** 3.7 — max připnutých položek na typ obsahu (sidebar). */
export const MAX_PINNED = 5;

type UsersRepoLike = Pick<IUsersRepository, 'findById' | 'update'>;

export interface FavoriteFieldPair {
  favorites:
    | 'favoriteArticleIds'
    | 'favoriteGalleryIds'
    | 'favoriteDiscussionIds';
  pinned: 'pinnedArticleIds' | 'pinnedGalleryIds' | 'pinnedDiscussionIds';
}

function requireUser(user: User | null): asserts user is User {
  if (!user)
    throw new NotFoundException({
      code: 'USER_NOT_FOUND',
      message: 'Uživatel nenalezen',
    });
}

/**
 * Toggle oblíbené položky. Odebrání z oblíbených kaskádně odepne i ze
 * sidebaru (pinned je podmnožina favorites).
 */
export async function toggleFavoriteId(opts: {
  usersRepo: UsersRepoLike;
  userId: string;
  itemId: string;
  fields: FavoriteFieldPair;
  /** Ověří existenci položky (hází modulový *_NOT_FOUND). */
  ensureItemExists: () => Promise<unknown>;
}): Promise<{ isFavorite: boolean }> {
  const { usersRepo, userId, itemId, fields } = opts;
  const user = await usersRepo.findById(userId);
  requireUser(user);
  await opts.ensureItemExists();
  const favorites = user[fields.favorites] ?? [];
  const isFavorite = favorites.includes(itemId);
  const newFavorites = isFavorite
    ? favorites.filter((id) => id !== itemId)
    : [...favorites, itemId];
  const update: Partial<User> = {};
  update[fields.favorites] = newFavorites;
  // cascade — odebrání z oblíbených zároveň odepne ze sidebaru
  if (isFavorite) {
    const pinned = user[fields.pinned] ?? [];
    if (pinned.includes(itemId))
      update[fields.pinned] = pinned.filter((id) => id !== itemId);
  }
  await usersRepo.update(userId, update);
  return { isFavorite: !isFavorite };
}

/**
 * Toggle připnutí do sidebaru — jen oblíbenou položku, max `MAX_PINNED`
 * na typ obsahu.
 */
export async function togglePinnedId(opts: {
  usersRepo: UsersRepoLike;
  userId: string;
  itemId: string;
  fields: FavoriteFieldPair;
  /** Ověří existenci položky (hází modulový *_NOT_FOUND). */
  ensureItemExists: () => Promise<unknown>;
  /** Modulové texty chyb (kódy NOT_FAVORITE / PIN_LIMIT jsou sdílené). */
  messages: { notFavorite: string; pinLimit: string };
}): Promise<{ isPinned: boolean }> {
  const { usersRepo, userId, itemId, fields, messages } = opts;
  const user = await usersRepo.findById(userId);
  requireUser(user);
  await opts.ensureItemExists();
  if (!(user[fields.favorites] ?? []).includes(itemId))
    throw new ConflictException({
      code: 'NOT_FAVORITE',
      message: messages.notFavorite,
    });
  const pinned = user[fields.pinned] ?? [];
  const isPinned = pinned.includes(itemId);
  if (!isPinned && pinned.length >= MAX_PINNED)
    throw new ConflictException({
      code: 'PIN_LIMIT',
      message: messages.pinLimit,
    });
  const newPinned = isPinned
    ? pinned.filter((id) => id !== itemId)
    : [...pinned, itemId];
  const update: Partial<User> = {};
  update[fields.pinned] = newPinned;
  await usersRepo.update(userId, update);
  return { isPinned: !isPinned };
}
