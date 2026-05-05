// backend/src/modules/push/push.service.ts
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type { IPushSubscriptionRepository } from './interfaces/push-subscription-repository.interface';
import type { PushSubscription } from './interfaces/push-subscription.interface';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

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

  async subscribe(userId: string, data: { endpoint: string; p256dh: string; auth: string }): Promise<PushSubscription> {
    return this.repo.upsertByEndpoint({ userId, ...data });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.repo.deleteByEndpoint(endpoint, userId);
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

  private async sendToSubscriptions(subs: PushSubscription[], payload: PushPayload): Promise<void> {
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
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
