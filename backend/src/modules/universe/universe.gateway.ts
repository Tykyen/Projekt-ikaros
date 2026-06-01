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
    // Posíláme jen signál „mapa se změnila" (BEZ dat). Klient si přes
    // `GET /universe` dotáhne mapu, která je server-side filtrovaná dle
    // visibility (hráč nedostane skryté uzly). Kdyby gateway poslal celou
    // `map`, hráč v `world:{worldId}` roomu by skrytá tělesa viděl po drátě.
    this.server
      .to(`world:${payload.worldId}`)
      .emit('universe:updated', { worldId: payload.worldId });
  }
}
