import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { JwtService } from '@nestjs/jwt';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions, Socket } from 'socket.io';
import { getAllowedOrigins } from './common/config/origins';
import { UserBanCacheService } from './modules/users/services/user-ban-cache.service';

/**
 * FIX-A část 1 (2026-07, WS reconnect-gate) — Socket.IO handshake middleware.
 *
 * Kontext: ~10 gateways (chat/worlds/maps/bestiae/presence/ikaros-messages/…)
 * si JWT nezávisle verifikují ve vlastním `handleConnection`, ale žádný z nich
 * nekontroluje STAV účtu — jen platnost podpisu. Access token žije 3 dny, takže
 * zabanovaný/smazaný uživatel mohl přes už otevřený (nebo nově navázaný) socket
 * dál používat WS akce (`chat:reaction:toggle`, `ikaros:whisper`, `sound:play`…)
 * až do expirace tokenu — REST vrstva (`JwtAuthGuard`) tohle už řeší per-request,
 * WS ne.
 *
 * Řešeno jako server-level middleware (`server.use`), NE úpravou každého
 * gateway zvlášť — běží PŘED handshake, tedy před handleConnection VŠECH
 * gateways najednou (jediné sdílené místo, bez nutnosti refaktorovat 10
 * souborů / měnit jejich konstruktory a testy). Zamítnutí zde socket vůbec
 * nenaváže (`next(err)` → klient dostane `connect_error`, žádný gateway
 * handleConnection se nespustí).
 *
 * Guest (anon) token — `payload.guest === true` — se nekontroluje, guest nemá
 * `User` účet (stejný pattern jako `chat.gateway.ts` handleConnection).
 * Chybějící/neplatný token middleware propustí beze změny — per-gateway JWT
 * verify si ho stejně odmítne samo (žádná regrese chování neautentizovaných
 * socketů, jen zavřeno okno pro banned/deleted).
 */
export async function wsAccountGate(
  socket: Pick<Socket, 'handshake'>,
  jwtService: JwtService,
  banCache: UserBanCacheService,
): Promise<Error | null> {
  const token = (socket.handshake.auth as { token?: string } | undefined)
    ?.token;
  if (!token) return null;
  let payload: { sub?: string; guest?: boolean };
  try {
    payload = jwtService.verify<{ sub?: string; guest?: boolean }>(token);
  } catch {
    return null; // neplatný/expirovaný token — nech na per-gateway JWT verify
  }
  if (!payload?.sub || payload.guest === true) return null;
  const blocked = await banCache.isBlocked(payload.sub);
  return blocked ? new Error('WS_ACCOUNT_BLOCKED') : null;
}

/**
 * D-NEW-chat-presence-scale + multi-instance Socket.IO podpora.
 *
 * Pokud je v env `REDIS_URL` a `SOCKET_IO_REDIS=1`, aktivuje Redis adapter —
 * `socket.emit` na jedné BE instanci se broadcastuje i klientům připojeným
 * k jiným instancím. Pro dev (single instance) zůstává default in-memory
 * adapter (rychlejší, žádná Redis latency).
 *
 * Pub/sub Redis client je dedicated — nesdílí se s aplikační Redis cache
 * (ban check), aby subscription nebyla blokovaná query-flow.
 */
export class CustomIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      maxHttpBufferSize: 5 * 1024 * 1024,
      cors: {
        origin: getAllowedOrigins(),
        credentials: true,
      },
    }) as Server;

    // FIX-A část 1 — viz JSDoc `wsAccountGate` výše. `app.get()` bez `strict`
    // prohledá celý DI kontejner (Nest-standardní pattern pro adaptery
    // bootstrapované mimo request/module scope, viz main.ts).
    const jwtService = this.app.get(JwtService);
    const banCache = this.app.get(UserBanCacheService);
    server.use((socket, next) => {
      wsAccountGate(socket, jwtService, banCache)
        .then((err) => next(err ?? undefined))
        // Fail-open — nesmí shodit handshake kvůli neočekávané chybě gate
        // (isBlocked() už DB chyby řeší interně; tohle je jen pojistka navíc).
        .catch(() => next());
    });

    const enableRedis = process.env.SOCKET_IO_REDIS === '1';
    const redisUrl = process.env.REDIS_URL;
    if (enableRedis && redisUrl) {
      const pubClient = new Redis(redisUrl);
      const subClient = pubClient.duplicate();
      server.adapter(createAdapter(pubClient, subClient));

      console.log('[Socket.IO] Redis adapter aktivován (multi-instance).');
    }

    return server;
  }
}
