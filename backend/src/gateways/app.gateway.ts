import {
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { BaseGateway } from './base.gateway';

export class AppGateway extends BaseGateway {
  private static readonly ROOM_PATTERN = /^[a-z]+:[a-zA-Z0-9]+$/;

  @SubscribeMessage('room:join')
  handleJoinRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!AppGateway.ROOM_PATTERN.test(room)) {
      return { error: 'Neplatný formát roomy' };
    }
    this.joinRoom(client, room);
    return { event: 'room:joined', data: room };
  }

  @SubscribeMessage('room:leave')
  handleLeaveRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!AppGateway.ROOM_PATTERN.test(room)) {
      return { error: 'Neplatný formát roomy' };
    }
    this.leaveRoom(client, room);
    return { event: 'room:left', data: room };
  }
}
