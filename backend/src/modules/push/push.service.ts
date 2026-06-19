// backend/src/modules/push/push.service.ts
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type { IPushSubscriptionRepository } from './interfaces/push-subscription-repository.interface';
import type {
  PushSubscription,
  PushSubscriptionSummary,
} from './interfaces/push-subscription.interface';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  /**
   * Klientský dedup klíč (service worker `showNotification` tag). Notifikace se
   * stejným tagem se na zařízení slučují (poslední přepíše) místo hromadění.
   * Posílá se v těle payloadu klientovi.
   */
  tag?: string;
  /**
   * Server-side collapse key (Push Message Topic, RFC 8030). Nová notifikace se
   * stejným topicem **nahradí** předchozí **nedoručenou** ve frontě providera —
   * offline zařízení tak po probuzení nedostane hromadu starých, jen poslední.
   * Transport-only (HTTP hlavička), neposílá se klientovi. Max 32 znaků,
   * URL-safe base64 ([A-Za-z0-9-_]); jinak se tiše vynechá.
   */
  topic?: string;
  /**
   * Time-To-Live v sekundách — jak dlouho provider drží notifikaci pro offline
   * zařízení, než ji zahodí. Default knihovny je 28 dní (offline telefon pak
   * dostane i dny staré zprávy) → držíme krátký default. Transport-only.
   */
  ttl?: number;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  /**
   * Default TTL pro push (sekundy). Notifikace „máš novou zprávu" má smysl jen
   * krátce; po vypršení ji provider zahodí, místo aby ji po dnech doručil.
   * Přebíjitelné per-notifikace přes `PushPayload.ttl`.
   */
  private static readonly DEFAULT_TTL_SECONDS = 4 * 60 * 60; // 4 h

  /** Validní Push Message Topic dle RFC 8030 (URL-safe base64, ≤32 znaků). */
  private static readonly TOPIC_RE = /^[A-Za-z0-9\-_]{1,32}$/;

  constructor(
    @Inject('IPushSubscriptionRepository')
    private readonly repo: IPushSubscriptionRepository,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    webpush.setVapidDetails(
      this.config.get<string>('VAPID_SUBJECT')!,
      this.config.get<string>('VAPID_PUBLIC_KEY')!,
      this.config.get<string>('VAPID_PRIVATE_KEY')!,
    );
  }

  getPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY')!;
  }

  async subscribe(
    userId: string,
    data: {
      endpoint: string;
      p256dh: string;
      auth: string;
      oldEndpoint?: string;
    },
    userAgent?: string,
  ): Promise<PushSubscription> {
    const { oldEndpoint, ...sub } = data;
    // Rotace odběru (prohlížeč/OS změní endpoint): smaž starý záznam, ať se
    // notifikace neposílá na mrtvý i nový endpoint zároveň → duplicitní push.
    if (oldEndpoint && oldEndpoint !== sub.endpoint) {
      await this.repo.deleteByEndpointOnly(oldEndpoint);
    }
    return this.repo.upsertByEndpoint({
      userId,
      ...sub,
      userAgent,
      lastUsedAt: new Date(),
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.repo.deleteByEndpoint(endpoint, userId);
  }

  /** D-030 — vlastní zařízení uživatele (bez kryptografických klíčů). */
  async getSubscriptions(userId: string): Promise<PushSubscriptionSummary[]> {
    const subs = await this.repo.findByUserId(userId);
    return subs.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
    }));
  }

  /** D-030 — odhlášení konkrétního zařízení ze seznamu (jen vlastníkem). */
  async unsubscribeById(userId: string, id: string): Promise<void> {
    await this.repo.deleteByIdAndUser(id, userId);
  }

  async notify(userId: string, payload: PushPayload): Promise<void> {
    const subs = await this.repo.findByUserId(userId);
    await this.sendToSubscriptions(subs, payload);
  }

  async notifyUsers(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.all(userIds.map((id) => this.notify(id, payload)));
  }

  async notifyAll(payload: PushPayload): Promise<void> {
    const subs = await this.repo.findAll();
    await this.sendToSubscriptions(subs, payload);
  }

  private async sendToSubscriptions(
    subs: PushSubscription[],
    payload: PushPayload,
  ): Promise<void> {
    // Transport-only pole (ttl/topic) jdou do HTTP hlaviček, ne klientovi.
    const { ttl, topic, ...clientPayload } = payload;
    const body = JSON.stringify(clientPayload);
    const options: webpush.RequestOptions = {
      TTL: ttl ?? PushService.DEFAULT_TTL_SECONDS,
    };
    if (topic && PushService.TOPIC_RE.test(topic)) options.topic = topic;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            options,
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.repo.deleteByEndpointOnly(sub.endpoint);
          } else {
            this.logger.warn(`Push failed for ${sub.endpoint}: ${String(err)}`);
          }
        }
      }),
    );
  }
}
