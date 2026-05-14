import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import type { UniverseMap } from './interfaces/universe-map.interface';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class UniverseGateway {
  @WebSocketServer() server: Server;

  @OnEvent('universe.updated')
  handleUniverseUpdated(payload: { worldId: string; map: UniverseMap }) {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('universe:updated', payload.map);
  }
}
