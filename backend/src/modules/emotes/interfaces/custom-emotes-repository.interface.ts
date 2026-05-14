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
  deleteById(id: string): Promise<boolean>;
}
