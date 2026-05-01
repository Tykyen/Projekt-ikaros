import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import type { World } from './interfaces/world.interface';
import type { WorldMembership } from './interfaces/world-membership.interface';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class WorldsGateway {
  @WebSocketServer() server: Server;

  @OnEvent('world.updated')
  handleWorldUpdated(world: World) {
    this.server.to(`world:${world.id}`).emit('world:updated', world);
  }

  @OnEvent('world.deleted')
  handleWorldDeleted(payload: { worldId: string }) {
    this.server.to(`world:${payload.worldId}`).emit('world:deleted', payload);
  }

  @OnEvent('world.membership.changed')
  handleMembershipChanged(payload: { worldId: string; membership: WorldMembership }) {
    this.server.to(`world:${payload.worldId}`).emit('world:membership:changed', payload.membership);
  }

  @OnEvent('world.membership.removed')
  handleMembershipRemoved(payload: { worldId: string; membershipId: string }) {
    this.server.to(`world:${payload.worldId}`).emit('world:membership:removed', payload.membershipId);
  }
}
