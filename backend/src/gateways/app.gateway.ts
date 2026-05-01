import { SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { BaseGateway } from './base.gateway';

export class AppGateway extends BaseGateway {
  @SubscribeMessage('room:join')
  handleJoinRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.joinRoom(client, room);
    return { event: 'room:joined', data: room };
  }

  @SubscribeMessage('room:leave')
  handleLeaveRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.leaveRoom(client, room);
    return { event: 'room:left', data: room };
  }
}
