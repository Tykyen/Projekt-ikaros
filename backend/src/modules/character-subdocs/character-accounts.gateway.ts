import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import { CharactersService } from '../characters/characters.service';
import type { AccountTransferReceivedEvent } from './character-accounts.service';

/**
 * D-8.6-transfer-notification — Websocket gateway pro broadcast notifikací
 * o převodu peněz. Reaguje na event `account.transfer.received` ze service
 * a vysílá na user-rooms všech co-owners cílového účtu.
 *
 * FE handler v `useSocketEvent('account:transfer:received', ...)` zobrazí toast.
 */
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class CharacterAccountsGateway {
  @WebSocketServer() server: Server;

  constructor(private readonly charactersService: CharactersService) {}

  @OnEvent('account.transfer.received')
  async onTransferReceived(
    payload: AccountTransferReceivedEvent,
  ): Promise<void> {
    // Pro každého co-owner cílového účtu zjistíme `userId` (jen PC mají).
    // NPC/Lokace nemají userId — netřeba broadcast.
    for (const charId of payload.recipientCharacterIds) {
      const character = await this.charactersService
        .findById(charId)
        .catch(() => null);
      const userId = character?.userId;
      if (!userId) continue;
      this.server.to(`user:${userId}`).emit('account:transfer:received', {
        fromAccountId: payload.fromAccountId,
        toAccountId: payload.toAccountId,
        amount: payload.amount,
        currency: payload.currency,
        description: payload.description,
      });
    }
  }
}
