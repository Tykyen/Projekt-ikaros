import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { World } from './interfaces/world.interface';
import type { WorldMembership } from './interfaces/world-membership.interface';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class WorldsGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Spec 2.4 — připoj socket k `user:<id>` roomu pro per-user notifikace
   * (`world:access-requested` pro PJ, `world:access-approved/rejected` pro
   * žadatele). Vzor z `ikaros-messages.gateway.ts`.
   */
  handleConnection(client: Socket): void {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) return;
      const payload = this.jwtService.verify<{ sub?: string }>(token);
      if (!payload?.sub) return;
      void client.join(`user:${payload.sub}`);
    } catch {
      // neplatný token — socket připojen bez user roomu
    }
  }

  @OnEvent('world.updated')
  handleWorldUpdated(world: World) {
    this.server.to(`world:${world.id}`).emit('world:updated', world);
  }

  @OnEvent('world.deleted')
  handleWorldDeleted(payload: { worldId: string }) {
    this.server.to(`world:${payload.worldId}`).emit('world:deleted', payload);
  }

  @OnEvent('world.membership.changed')
  handleMembershipChanged(payload: {
    worldId: string;
    membership: WorldMembership;
  }) {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('world:membership:changed', payload.membership);
  }

  @OnEvent('world.membership.removed')
  handleMembershipRemoved(payload: { worldId: string; membershipId: string }) {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('world:membership:removed', payload.membershipId);
  }

  /**
   * Spec 2.4 — nová žádost o vstup. Cíl: PJ vlastník (toast + invalidate
   * `pending-actions` query). Žadatel v tom roomu zatím není (není member).
   */
  @OnEvent('world.access.requested')
  handleAccessRequested(payload: {
    accessRequestId: string;
    worldId: string;
    worldName: string;
    worldSlug: string;
    ownerId: string;
    requesterId: string;
  }) {
    this.server
      .to(`user:${payload.ownerId}`)
      .emit('world:access-requested', payload);
  }

  /**
   * Spec 2.4 — schválení žádosti o vstup. Cíl: žadatel (toast + invalidate
   * `worlds/my` + `worlds/my-access-requests`).
   */
  @OnEvent('world.access.approved')
  handleAccessApproved(payload: {
    accessRequestId: string;
    worldId: string;
    worldName: string;
    worldSlug: string;
    requesterId: string;
  }) {
    this.server
      .to(`user:${payload.requesterId}`)
      .emit('world:access-approved', payload);
  }

  /**
   * Spec 2.4 — zamítnutí žádosti o vstup. Cíl: žadatel (toast + invalidate
   * `worlds/my-access-requests`).
   */
  @OnEvent('world.access.rejected')
  handleAccessRejected(payload: {
    accessRequestId: string;
    worldId: string;
    worldName: string;
    requesterId: string;
  }) {
    this.server
      .to(`user:${payload.requesterId}`)
      .emit('world:access-rejected', payload);
  }

  /**
   * Spec 2.4 — žadatel zrušil žádost. Cíl: PJ vlastník (badge count update,
   * bez toastu — PJ to neudělal a není to akutní).
   */
  @OnEvent('world.access.cancelled')
  handleAccessCancelled(payload: {
    accessRequestId: string;
    worldId: string;
    ownerId: string;
  }) {
    this.server
      .to(`user:${payload.ownerId}`)
      .emit('world:access-cancelled', payload);
  }
}
