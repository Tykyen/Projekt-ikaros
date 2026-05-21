import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import { CustomEmote } from './interfaces/custom-emote.interface';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class EmotesGateway {
  @WebSocketServer() server: Server;

  @OnEvent('emote.created')
  handleEmoteCreated(payload: {
    worldId: string | null;
    emote: CustomEmote;
  }): void {
    if (payload.worldId) {
      this.server
        .to(`world:${payload.worldId}`)
        .emit('emote:created', payload.emote);
    } else {
      // Krok 6.4f — globální emote = broadcast všem připojeným klientům.
      this.server.emit('emote:created-global', payload.emote);
    }
  }

  @OnEvent('emote.deleted')
  handleEmoteDeleted(payload: {
    worldId: string | null;
    emoteId: string;
  }): void {
    if (payload.worldId) {
      this.server
        .to(`world:${payload.worldId}`)
        .emit('emote:deleted', { emoteId: payload.emoteId });
    } else {
      this.server.emit('emote:deleted-global', { emoteId: payload.emoteId });
    }
  }

  @OnEvent('emote.updated')
  handleEmoteUpdated(payload: {
    worldId: string | null;
    emote: CustomEmote;
  }): void {
    if (payload.worldId) {
      this.server
        .to(`world:${payload.worldId}`)
        .emit('emote:updated', payload.emote);
    } else {
      this.server.emit('emote:updated-global', payload.emote);
    }
  }
}
