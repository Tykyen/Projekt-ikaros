import { CustomEmote } from './custom-emote.interface';

export interface ICustomEmotesRepository {
  findByWorldId(worldId: string): Promise<CustomEmote[]>;
  findGlobal(): Promise<CustomEmote[]>;
  findById(id: string): Promise<CustomEmote | null>;
  findByShortcode(
    shortcode: string,
    worldId: string | null,
  ): Promise<CustomEmote | null>;
  create(data: Omit<CustomEmote, 'id' | 'createdAt'>): Promise<CustomEmote>;
  /** D-NEW-emote-update — částečný update existujícího emote. */
  updateById(
    id: string,
    updates: Partial<
      Pick<CustomEmote, 'name' | 'shortcode' | 'imageId' | 'imageUrl'>
    >,
  ): Promise<CustomEmote | null>;
  deleteById(id: string): Promise<boolean>;
  /** Krok 6.4a — počet emotů světa (pro limit kontrolu). */
  countByWorldId(worldId: string): Promise<number>;
  /** Krok 6.4a — počet globálních emotů (pro limit kontrolu). */
  countGlobal(): Promise<number>;
}
