import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL ?? 'http://localhost:5173',
  'http://localhost:5174',
];

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
  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      maxHttpBufferSize: 5 * 1024 * 1024,
      cors: {
        origin: ALLOWED_ORIGINS,
        credentials: true,
      },
    }) as Server;

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
