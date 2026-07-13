import {
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { BaseGateway } from './base.gateway';
import { ChatService } from '../modules/chat/chat.service';
import { allowWsEvent } from '../common/ws/ws-rate-limit';

// @Injectable() — AppGateway nemá vlastní @WebSocketGateway (dědí z BaseGateway);
// dekorátor je nutný, aby TS emitoval `design:paramtypes` pro konstruktor (DI
// ChatService pro R-04 gate). Bez něj Nest injektuje undefined.
@Injectable()
export class AppGateway extends BaseGateway {
  private static readonly ROOM_PATTERN = /^[a-z]+:[a-zA-Z0-9]+$/;

  constructor(private readonly chatService: ChatService) {
    super();
  }

  @SubscribeMessage('room:join')
  async handleJoinRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ) {
    // D-LAUNCH-GAP — anti-flood; `chat:` větev dělá DB access check. Limit 30
    // (nad default): reconnect re-emituje join všech otevřených roomů najednou.
    // Tiché zahození (žádný ack) — flooder nedostane zpětnou vazbu.
    if (!allowWsEvent(client, 'room:join', { limit: 30 })) return;
    if (!AppGateway.ROOM_PATTERN.test(room)) {
      return { error: 'Neplatný formát roomy' };
    }
    // R-04 — `chat:{channelId}` room nese reálné zprávy world kanálu. REST
    // (`getMessages`) ho gatuje `hasChannelAccess`, ale generický `room:join`
    // byl bez kontroly → leak real-time zpráv restricted kanálu. Gate jen pro
    // world kanály (globální/neznámé pustí — viz `canJoinChannelRoom`). Identita
    // z OVĚŘENÉHO `client.data.userId` (JWT handshake), ne z payloadu.
    // Pozn.: ostatní prefixy (`world:{id}` počasí ap.) zůstávají bez membership
    // checku — N-8 přijaté riziko (kosmetická data).
    if (room.startsWith('chat:')) {
      const channelId = room.slice('chat:'.length);
      const userId = (client.data as { userId?: string }).userId;
      if (!(await this.chatService.canJoinChannelRoom(channelId, userId))) {
        return { error: 'Nedostatečná oprávnění' };
      }
    }
    // FIX-1 — `user:{id}` room nese privátní per-user eventy (whispery,
    // account transfery, friend requesty ap.). Bez gate mohl socket joinnout
    // libovolný cizí `user:{id}` room a odposlouchávat cizí soukromé eventy.
    // Identita z OVĚŘENÉHO `client.data.userId` (JWT handshake), ne z payloadu.
    if (room.startsWith('user:')) {
      const userId = (client.data as { userId?: string }).userId;
      if (room !== `user:${userId}`) {
        return { error: 'Nedostatečná oprávnění' };
      }
    }
    this.joinRoom(client, room);
    return { event: 'room:joined', data: room };
  }

  @SubscribeMessage('room:leave')
  handleLeaveRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!allowWsEvent(client, 'room:leave', { limit: 30 })) return; // D-LAUNCH-GAP
    if (!AppGateway.ROOM_PATTERN.test(room)) {
      return { error: 'Neplatný formát roomy' };
    }
    this.leaveRoom(client, room);
    return { event: 'room:left', data: room };
  }
}
