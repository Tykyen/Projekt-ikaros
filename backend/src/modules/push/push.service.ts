// backend/src/modules/push/push.service.ts
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type { IPushSubscriptionRepository } from './interfaces/push-subscription-repository.interface';
import type {
  PushSubscription,
  PushSubscriptionSummary,
} from './interfaces/push-subscription.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import {
  wantsPush,
  type NotificationCategory,
} from '../../common/notifications/notification-preferences';

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
    // 15.9 — read-only preference pro filtr (jednosměrná závislost push→users,
    // oba @Global → token dostupný bez importu UsersModule, bez cyklu).
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
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
    // FIX-7 — scoped na `{endpoint, userId}` (vzor `deleteByEndpoint`), ne jen
    // endpoint: útočník se známým cizím `oldEndpoint` nesmí smazat cizí
    // subscription. `deleteByEndpointOnly` (bez userId) zůstává jen pro
    // interní 404/410 cleanup v `sendToSubscriptions`, kde userId neznáme.
    if (oldEndpoint && oldEndpoint !== sub.endpoint) {
      await this.repo.deleteByEndpoint(oldEndpoint, userId);
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

  /**
   * 15.9 — `category` (volitelné): když je předáno, odešle jen příjemcům, kteří
   * danou kategorii nemají vypnutou (`notificationPreferences`). Bez kategorie =
   * původní chování (odešle vždy) → zpětná kompatibilita.
   */
  async notify(
    userId: string,
    payload: PushPayload,
    category?: NotificationCategory,
  ): Promise<void> {
    if (category && !(await this.userWantsCategory(userId, category))) return;
    const subs = await this.repo.findByUserId(userId);
    await this.sendToSubscriptions(subs, payload);
  }

  async notifyUsers(
    userIds: string[],
    payload: PushPayload,
    category?: NotificationCategory,
  ): Promise<void> {
    const allowed = category
      ? await this.filterByCategory(userIds, category)
      : userIds;
    // profiltrováno → notify bez kategorie (žádný druhý lookup per příjemce)
    await Promise.all(allowed.map((id) => this.notify(id, payload)));
  }

  async notifyAll(
    payload: PushPayload,
    category?: NotificationCategory,
  ): Promise<void> {
    const subs = await this.repo.findAll();
    if (!category) {
      await this.sendToSubscriptions(subs, payload);
      return;
    }
    const userIds = Array.from(new Set(subs.map((s) => s.userId)));
    const allowed = new Set(await this.filterByCategory(userIds, category));
    await this.sendToSubscriptions(
      subs.filter((s) => allowed.has(s.userId)),
      payload,
    );
  }

  /** Vrátí podmnožinu `userIds`, kteří chtějí push dané kategorie (1 batch dotaz). */
  private async filterByCategory(
    userIds: string[],
    category: NotificationCategory,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const distinct = Array.from(new Set(userIds));
    const users = await this.usersRepo.findByIds(distinct);
    const prefsById = new Map(
      users.map((u) => [u.id, u.notificationPreferences]),
    );
    return distinct.filter((id) => wantsPush(prefsById.get(id), category));
  }

  private async userWantsCategory(
    userId: string,
    category: NotificationCategory,
  ): Promise<boolean> {
    const user = await this.usersRepo.findById(userId);
    return wantsPush(user?.notificationPreferences, category);
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
            // FIX-49 (log hygiene): endpoint je PII (unikátní push URL) — loguj jen sub.id.
            this.logger.warn(
              `Push failed for subscription ${sub.id}: ${String(err)}`,
            );
          }
        }
      }),
    );
  }
}
