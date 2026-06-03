import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IkarosMessagesService } from './ikaros-messages.service';
import { UsersService } from '../users/users.service';

/** Systémový odesílatel — bez role → obchází D-057 friend-only check. */
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };

/**
 * Spec 13.2b — událostní oznámení („Události" v notifikačním centru). Doménové
 * eventy, které dnes neměly trvalý záznam, převede na systémovou zprávu do
 * Pošty (`senderId='system'`). Schválení článku/galerie/diskuze už systémovou
 * zprávu posílají ve svých modulech; tady doplňujeme svět + přiřazení postavy.
 */
@Injectable()
export class SystemEventsListener {
  private readonly logger = new Logger(SystemEventsListener.name);

  constructor(
    private readonly msgService: IkarosMessagesService,
    private readonly usersService: UsersService,
  ) {}

  @OnEvent('world.access.approved')
  async onWorldAccessApproved(payload: {
    worldName?: string;
    requesterId?: string;
  }): Promise<void> {
    if (!payload?.requesterId) return;
    await this.notify(
      payload.requesterId,
      'Přístup do světa schválen',
      `Tvá žádost o vstup do světa „${payload.worldName ?? 'svět'}" byla schválena.`,
    );
  }

  @OnEvent('world.character.assigned')
  async onCharacterAssigned(payload: {
    worldName?: string;
    userId?: string;
    characterPath?: string;
  }): Promise<void> {
    if (!payload?.userId) return;
    const postava = payload.characterPath ? ` ${payload.characterPath}` : '';
    await this.notify(
      payload.userId,
      'Přiřazena postava',
      `Ve světě „${payload.worldName ?? 'svět'}" ti byla přiřazena postava${postava}.`,
    );
  }

  private async notify(
    userId: string,
    subject: string,
    body: string,
  ): Promise<void> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user) return;
      await this.msgService.create(
        { recipientId: userId, recipientName: user.username, subject, body },
        SYSTEM_SENDER,
      );
    } catch (err: unknown) {
      // best-effort — oznámení nesmí shodit doménovou akci.
      this.logger.warn(`System notify failed for ${userId}: ${String(err)}`);
    }
  }
}
