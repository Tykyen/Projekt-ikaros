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

// PC-13: WS CORS řeší CustomIoAdapter (server-level); dekorátorový cors byl mrtvý.
@WebSocketGateway({})
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
    // R-RUN-01 / W-RUN-01 (plný audit 2026-06-20) — leak-safe signál místo
    // plného `World` (ownerId/deletedAt/themeOverrides/activeMapWeather…). FE
    // (useWorldSocket) jen invaliduje a refetchne filtrovaný GET — payload nečte.
    this.server
      .to(`world:${world.id}`)
      .emit('world:updated', { worldId: world.id });
  }

  @OnEvent('world.deleted')
  handleWorldDeleted(payload: { worldId: string }) {
    this.server.to(`world:${payload.worldId}`).emit('world:deleted', payload);
  }

  /**
   * C-04 — novinka světa se změnila (create/update/delete/archive). Leak-safe
   * signál do `world:{id}` roomu, klient si refetchne filtrovaný GET. Globální
   * novinka (worldId === null) se do žádného world roomu neemituje.
   */
  @OnEvent('world-news.changed')
  handleWorldNewsChanged(payload: { worldId: string | null }) {
    if (payload.worldId) {
      this.server
        .to(`world:${payload.worldId}`)
        .emit('world:news:changed', payload);
    }
  }

  @OnEvent('world.membership.changed')
  handleMembershipChanged(payload: {
    worldId: string;
    membership: WorldMembership;
  }) {
    // R-RUN-01 / W-RUN-01 (plný audit 2026-06-20) — leak-safe signál místo
    // plného `WorldMembership` (per-user privátní data: chatColor, chatFont,
    // themeUserOverrides, jailedDiceSkins, akj, chatGroupOrder, currentSceneId).
    // FE (useWorldSocket) jen invaliduje seznam členů — payload nečte.
    this.server
      .to(`world:${payload.worldId}`)
      .emit('world:membership:changed', {
        worldId: payload.worldId,
        membershipId: payload.membership.id,
      });
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

  /**
   * 15.10 fáze B — nová cílená pozvánka do světa. Cíl: pozvaný (toast +
   * invalidate `pending-actions`). Odkazové pozvánky se sem neemitují
   * (nemají konkrétního adresáta).
   */
  @OnEvent('world.invite.created')
  handleInviteCreated(payload: {
    inviteId: string;
    worldId: string;
    worldName: string;
    worldSlug: string;
    invitedUserId: string;
  }) {
    this.server
      .to(`user:${payload.invitedUserId}`)
      .emit('world:invite-received', payload);
  }

  /**
   * 15.11 — nový návrh obsahu hráče čeká na schválení. Cíl: PJ/co-PJ ve světě
   * (invalidace fronty „ke zpracování" + badge). Leak-safe signál {worldId}.
   */
  @OnEvent('world.page-review.changed')
  handlePageReviewChanged(payload: { worldId: string }) {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('world:page-review-changed', payload);
  }

  /**
   * 15.11 — PJ vyřídil návrh (approved / rework / discard). Cíl: autor (toast) +
   * svět (invalidace fronty ke zpracování).
   */
  @OnEvent('world.page-review.resolved')
  handlePageReviewResolved(payload: {
    worldId: string;
    slug: string;
    action: 'approved' | 'rework' | 'discard';
    authorId?: string;
  }) {
    if (payload.authorId) {
      this.server
        .to(`user:${payload.authorId}`)
        .emit('world:page-review-resolved', payload);
    }
    this.server
      .to(`world:${payload.worldId}`)
      .emit('world:page-review-changed', { worldId: payload.worldId });
  }
}
