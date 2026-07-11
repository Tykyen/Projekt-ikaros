import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AlertLevel = 'critical' | 'warn' | 'info';

const COLOR: Record<AlertLevel, number> = {
  critical: 0xe01e5a,
  warn: 0xf2c744,
  info: 0x36a64f,
};
const ICON: Record<AlertLevel, string> = {
  critical: '🔴',
  warn: '⚠️',
  info: 'ℹ️',
};
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000; // 10 min / typ — proti alert-floodu

interface AlertOpts {
  /** Přebije default 10min cooldown pro tento typ alertu. */
  cooldownMs?: number;
  /** Dedupe klíč (default `level:title`). Stejný klíč se v cooldownu nepošle 2×. */
  dedupeKey?: string;
}

/**
 * Monitoring (3. noha) — alert kanál. Pošle embed na `DISCORD_ALERT_WEBHOOK`
 * (env/secret). Bez webhooku = no-op + log (jako VAPID/Cloudinary fallback).
 *
 * Volat z: health-cron (degraded), global exception filter (5xx spike), auth
 * (login-fail spike = brute-force), disk-check. Rate-limit povinný — degraded
 * stav by jinak vygeneroval stovky zpráv/min.
 *
 * Alerting NIKDY nesmí shodit app — každá chyba se jen loguje.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly lastSent = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  async alert(
    level: AlertLevel,
    title: string,
    detail: string,
    opts: AlertOpts = {},
  ): Promise<void> {
    const key = opts.dedupeKey ?? `${level}:${title}`;
    const cooldown = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    const now = Date.now();
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < cooldown) {
      return; // rate-limit — nezahltit kanál opakovaným alertem
    }
    this.lastSent.set(key, now);

    const webhook = this.config.get<string>('DISCORD_ALERT_WEBHOOK');
    if (!webhook) {
      this.logger.warn(
        `[ALERT ${level}] ${title}: ${detail} (DISCORD_ALERT_WEBHOOK nenastaven → jen log)`,
      );
      return;
    }

    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Ikaros Monitoring',
          embeds: [
            {
              title: `${ICON[level]} ${title}`,
              description: detail.slice(0, 4000),
              color: COLOR[level],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.error(
        `Discord alert selhal: ${err instanceof Error ? err.message : 'chyba'}`,
      );
    }
  }
}
