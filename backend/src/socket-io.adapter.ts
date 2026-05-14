import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL ?? 'http://localhost:5173',
  'http://localhost:5174',
];

export class CustomIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      maxHttpBufferSize: 5 * 1024 * 1024,
      cors: {
        origin: ALLOWED_ORIGINS,
        credentials: true,
      },
    }) as Server;
  }
}
