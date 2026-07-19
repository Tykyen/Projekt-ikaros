import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * 23.4 — Sentry tunnel: adblockery blokují přímé FE requesty na
 * `*.ingest.sentry.io` (živě ověřeno: ERR_BLOCKED_BY_ADBLOCKER) → FE posílá
 * envelope na vlastní doménu a BE ho přepošle na ingest. Vlastní doménu
 * blocklisty neblokují, takže vidíme i chyby uživatelů s adblockem.
 *
 * Bezpečnost (žádný open relay): envelope hlavička nese DSN — přeposíláme JEN
 * na ingest host shodný s naším `SENTRY_DSN` (FE i BE projekt = stejná org)
 * a s čistě číselným project ID. Rate-limit kryje globální ThrottlerGuard.
 * Raw body (text/plain od SDK) registruje middleware v `main.ts`.
 */
@ApiTags('Monitoring')
@Controller('monitoring')
export class SentryTunnelController {
  private readonly logger = new Logger(SentryTunnelController.name);

  @Post('tunnel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sentry tunnel — relay FE envelope na ingest' })
  @ApiResponse({ status: 200, description: '{ relayed: boolean }' })
  async tunnel(@Req() req: Request): Promise<{ relayed: boolean }> {
    const ownDsn = process.env.SENTRY_DSN;
    if (!ownDsn) {
      throw new ServiceUnavailableException('Error tracking není zapnutý.');
    }

    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('Prázdný nebo nečitelný envelope.');
    }

    // Envelope = NDJSON; první řádek je JSON hlavička s `dsn`.
    const newline = body.indexOf(0x0a);
    const headerRaw = body
      .subarray(0, newline === -1 ? body.length : newline)
      .toString('utf8');
    let dsn: URL;
    try {
      const header = JSON.parse(headerRaw) as { dsn?: string };
      dsn = new URL(header.dsn ?? '');
    } catch {
      throw new BadRequestException('Envelope bez platné DSN hlavičky.');
    }

    const projectId = dsn.pathname.replace(/\//g, '');
    const allowedHost = new URL(ownDsn).host;
    if (dsn.host !== allowedHost || !/^\d+$/.test(projectId)) {
      throw new BadRequestException('DSN mimo povolenou organizaci.');
    }

    try {
      const res = await fetch(
        `https://${allowedHost}/api/${projectId}/envelope/`,
        {
          method: 'POST',
          // Kopie do Uint8Array<ArrayBuffer> — BodyInit nezná Buffer ani
          // view nad ArrayBufferLike (TS 5.7 generické TypedArrays).
          body: new Uint8Array(body),
          headers: {
            'Content-Type':
              req.headers['content-type'] ?? 'application/x-sentry-envelope',
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      return { relayed: res.ok };
    } catch (err) {
      // Výpadek ingestu nesmí vracet 5xx (alert spam + rekurze) — event propadne.
      this.logger.warn(`Sentry tunnel relay selhal: ${(err as Error).message}`);
      return { relayed: false };
    }
  }
}
