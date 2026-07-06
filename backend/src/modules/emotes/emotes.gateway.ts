import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import { CustomEmote } from './interfaces/custom-emote.interface';

/**
 * FIX-B část 1 (2026-07) — `world:{worldId}` room se joinne bez membership
 * kontroly (N-8, přijaté riziko). Plný `CustomEmote` obsahoval `createdBy`
 * (userId autora emotu) — leak identity komukoli v roomu. FE (`useWorldEmotes`
 * / `useGlobalEmotes`) `createdBy` z WS payloadu nečte (jen REST admin grid),
 * takže stripnutí je zpětně kompatibilní. Ostatní pole (imageId/tags/createdAt)
 * NEJSOU citlivá (vlastnosti emotu, ne osoby) → zůstávají beze změny.
 */
function toLeakSafeEmote(emote: CustomEmote): Omit<CustomEmote, 'createdBy'> {
  const { createdBy: _createdBy, ...safe } = emote;
  return safe;
}

// PC-13: WS CORS řeší CustomIoAdapter (server-level); dekorátorový cors byl mrtvý.
@WebSocketGateway({})
export class EmotesGateway {
  @WebSocketServer() server: Server;

  @OnEvent('emote.created')
  handleEmoteCreated(payload: {
    worldId: string | null;
    emote: CustomEmote;
  }): void {
    const safeEmote = toLeakSafeEmote(payload.emote);
    if (payload.worldId) {
      this.server
        .to(`world:${payload.worldId}`)
        .emit('emote:created', safeEmote);
    } else {
      // Krok 6.4f — globální emote = broadcast všem připojeným klientům.
      this.server.emit('emote:created-global', safeEmote);
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
    const safeEmote = toLeakSafeEmote(payload.emote);
    if (payload.worldId) {
      this.server
        .to(`world:${payload.worldId}`)
        .emit('emote:updated', safeEmote);
    } else {
      this.server.emit('emote:updated-global', safeEmote);
    }
  }
}
