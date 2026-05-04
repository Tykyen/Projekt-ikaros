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
  handleEmoteCreated(payload: { worldId: string; emote: CustomEmote }): void {
    this.server.to(`world:${payload.worldId}`).emit('emote:created', payload.emote);
  }
}
