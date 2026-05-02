import { Injectable, Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ICharactersRepository } from './interfaces/characters-repository.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { Character } from './interfaces/character.interface';

@Injectable()
export class PopulateProfileImagesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PopulateProfileImagesService.name);

  constructor(
    @Inject('ICharactersRepository') private readonly charactersRepo: ICharactersRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const characters = await this.charactersRepo.findAll();
      const cps = characters.filter((c) => c.userId && !c.isNpc);
      for (const cp of cps) {
        await this.populateFromCharacter(cp);
      }
      this.logger.log(`PopulateProfileImages backfill: zpracováno ${cps.length} CP`);
    } catch (err) {
      this.logger.error('PopulateProfileImages backfill selhal', err);
    }
  }

  @OnEvent('character.created')
  async handleCharacterCreated(character: Character): Promise<void> {
    await this.populateFromCharacter(character);
  }

  @OnEvent('character.updated')
  async handleCharacterUpdated(character: Character): Promise<void> {
    await this.populateFromCharacter(character);
  }

  async populateFromCharacter(character: Pick<Character, 'userId' | 'imageUrl' | 'isNpc'>): Promise<void> {
    if (!character.userId || character.isNpc) return;
    if (!character.imageUrl) return;

    const user = await this.usersRepo.findById(character.userId);
    if (!user) return;
    if (user.profileImageUrl) return;

    await this.usersRepo.update(character.userId, { profileImageUrl: character.imageUrl });
  }
}
