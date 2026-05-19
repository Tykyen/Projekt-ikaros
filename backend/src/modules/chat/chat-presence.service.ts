import { Injectable } from '@nestjs/common';

/** Přítomný uživatel v konverzaci (krok 6.1d). `worldRole` nese kvůli grupování
 *  presence panelu na FE (Vypravěči / Korektoři / Ostatní). */
export interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  worldRole: number;
}

/** Záznam vrácený při odchodu — `stillPresent` říká, zda uživateli zůstal
 *  v konverzaci jiný socket (víc panelů/záložek) → odchod se nebroadcastuje. */
export interface PresenceLeave {
  channelId: string;
  user: PresenceUser;
  stillPresent: boolean;
}

/**
 * In-memory presence světového chatu. Drží jen běh procesu — při více
 * instancích BE není sdílená (dluh `D-NEW-chat-presence-scale`).
 * Mapuje `channelId → (socketId → uživatel)`; jeden uživatel může mít víc
 * socketů (víc otevřených panelů).
 */
@Injectable()
export class ChatPresenceService {
  private readonly channels = new Map<string, Map<string, PresenceUser>>();

  /** Přidá socket do konverzace. `alreadyPresent` = uživatel tam už byl jiným
   *  socketem → příchod se nebroadcastuje znovu. */
  join(
    channelId: string,
    socketId: string,
    user: PresenceUser,
  ): { alreadyPresent: boolean } {
    let sockets = this.channels.get(channelId);
    if (!sockets) {
      sockets = new Map();
      this.channels.set(channelId, sockets);
    }
    const alreadyPresent = this.hasUserIn(sockets, user.userId);
    sockets.set(socketId, user);
    return { alreadyPresent };
  }

  /** Odebere socket z konverzace. */
  leave(channelId: string, socketId: string): PresenceLeave | null {
    const sockets = this.channels.get(channelId);
    if (!sockets) return null;
    const user = sockets.get(socketId);
    if (!user) return null;
    sockets.delete(socketId);
    const stillPresent = this.hasUserIn(sockets, user.userId);
    if (sockets.size === 0) this.channels.delete(channelId);
    return { channelId, user, stillPresent };
  }

  /** Odebere socket ze všech konverzací (disconnect). */
  leaveAll(socketId: string): PresenceLeave[] {
    const removed: PresenceLeave[] = [];
    for (const [channelId, sockets] of this.channels) {
      const user = sockets.get(socketId);
      if (!user) continue;
      sockets.delete(socketId);
      const stillPresent = this.hasUserIn(sockets, user.userId);
      removed.push({ channelId, user, stillPresent });
    }
    for (const { channelId } of removed) {
      if (this.channels.get(channelId)?.size === 0)
        this.channels.delete(channelId);
    }
    return removed;
  }

  /** Unikátní přítomní uživatelé konverzace (dedup dle `userId`). */
  list(channelId: string): PresenceUser[] {
    const sockets = this.channels.get(channelId);
    if (!sockets) return [];
    const byUser = new Map<string, PresenceUser>();
    for (const u of sockets.values()) byUser.set(u.userId, u);
    return [...byUser.values()];
  }

  private hasUserIn(
    sockets: Map<string, PresenceUser>,
    userId: string,
  ): boolean {
    for (const u of sockets.values()) if (u.userId === userId) return true;
    return false;
  }
}
