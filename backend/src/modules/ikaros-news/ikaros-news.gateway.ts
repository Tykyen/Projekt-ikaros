import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';

/**
 * C-47 — Ikaros novinky jsou platformový obsah. Po každé mutaci pošli
 * leak-safe broadcast signál všem připojeným klientům; klient si refetchne
 * filtrovaný `GET /ikaros-news`.
 */
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class IkarosNewsGateway {
  @WebSocketServer() server: Server;

  @OnEvent('ikaros-news.changed')
  handleIkarosNewsChanged() {
    this.server.emit('ikaros:news:changed', {});
  }
}
