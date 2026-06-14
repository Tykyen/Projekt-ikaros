import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';

/**
 * C-47 — Ikaros akce jsou platformový obsah. Po každé mutaci pošli leak-safe
 * broadcast signál všem připojeným klientům; klient si refetchne filtrovaný
 * `GET /ikaros-events`.
 */
// PC-13: WS CORS řeší CustomIoAdapter (server-level); dekorátorový cors byl mrtvý.
@WebSocketGateway({})
export class IkarosEventsGateway {
  @WebSocketServer() server: Server;

  @OnEvent('ikaros-events.changed')
  handleIkarosEventsChanged() {
    this.server.emit('ikaros:events:changed', {});
  }
}
