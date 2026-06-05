import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';

/**
 * C-47 — Ikaros akce jsou platformový obsah. Po každé mutaci pošli leak-safe
 * broadcast signál všem připojeným klientům; klient si refetchne filtrovaný
 * `GET /ikaros-events`.
 */
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class IkarosEventsGateway {
  @WebSocketServer() server: Server;

  @OnEvent('ikaros-events.changed')
  handleIkarosEventsChanged() {
    this.server.emit('ikaros:events:changed', {});
  }
}
