import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';

interface WorldCreatedEvent {
  name: string;
  slug: string;
  ownerId: string;
  genre?: string;
  system: string;
}

interface CharacterCreatedEvent {
  userId?: string;
  worldId: string;
  name: string;
  kind?: string;
  isNpc?: boolean;
}

/**
 * Komunitní oznámení do Discordu — když ve světě vznikne nová jeskyně (svět)
 * nebo nová postava. Posílá embed na `DISCORD_EVENTS_WEBHOOK` (env/secret,
 * ODLIŠNÝ od `DISCORD_ALERT_WEBHOOK` pro ops-alerty). Bez env = no-op.
 *
 * Naslouchá existujícím eventům (`world.created`, `character.created`) — žádný
 * zásah do worlds/characters service. Fire-and-forget, chyba jen do logu
 * (oznámení nesmí ovlivnit tvorbu světa/postavy).
 */
@Injectable()
export class CommunityNotifyService {
  private readonly logger = new Logger(CommunityNotifyService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
  ) {}

  // Handlery jsou SYNCHRONNÍ (void) a práci fire-and-forgetnou → `character.created`
  // je emitAsync (čeká na listenery); kdyby handler awaitoval Discord (až 5 s),
  // zdržel by 201 tvorby postavy. Vlastní notify metody jsou public (testovatelné).
  @OnEvent('world.created')
  onWorldCreated(world: WorldCreatedEvent): void {
    void this.notifyWorld(world);
  }

  @OnEvent('character.created')
  onCharacterCreated(ev: CharacterCreatedEvent): void {
    void this.notifyCharacter(ev);
  }

  async notifyWorld(world: WorldCreatedEvent): Promise<void> {
    const owner = await this.safeUser(world.ownerId);
    const genre = world.genre ? `${world.genre} · ` : '';
    await this.post(
      '🏰 Nový svět',
      `**${world.name}**\n${genre}${world.system}\nZaložil: **${owner}**`,
      0x5865f2,
    );
  }

  async notifyCharacter(ev: CharacterCreatedEvent): Promise<void> {
    // 'location' je technicky Character (kind), ale není „osoba" → neoznamovat.
    if (ev.kind === 'location') return;
    const creator = ev.userId ? await this.safeUser(ev.userId) : 'PJ';
    const worldName = await this.safeWorld(ev.worldId);
    const label = ev.isNpc ? 'NPC' : 'postava';
    const kind = ev.kind && ev.kind !== 'character' ? ` · ${ev.kind}` : '';
    await this.post(
      '🧙 Nová postava',
      `**${ev.name}** (${label}${kind})\nSvět: **${worldName}**\nVytvořil: **${creator}**`,
      0x9b59b6,
    );
  }

  private async safeUser(id: string): Promise<string> {
    try {
      const u = await this.usersRepo.findById(id);
      return u?.username ?? 'neznámý';
    } catch {
      return 'neznámý';
    }
  }

  private async safeWorld(id: string): Promise<string> {
    try {
      const w = await this.worldsRepo.findById(id);
      return w?.name ?? '?';
    } catch {
      return '?';
    }
  }

  private async post(
    title: string,
    description: string,
    color: number,
  ): Promise<void> {
    const url = this.config.get<string>('DISCORD_EVENTS_WEBHOOK');
    if (!url) {
      this.logger.debug(
        `[EVENTS] ${title}: ${description.replace(/\n/g, ' ')} (DISCORD_EVENTS_WEBHOOK nenastaven)`,
      );
      return;
    }
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Ikaros',
          embeds: [
            {
              title,
              description: description.slice(0, 4000),
              color,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.error(
        `Events webhook selhal: ${err instanceof Error ? err.message : 'chyba'}`,
      );
    }
  }
}
