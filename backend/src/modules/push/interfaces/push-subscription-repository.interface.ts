import type { PushSubscription } from './push-subscription.interface';

export interface IPushSubscriptionRepository {
  findByUserId(userId: string): Promise<PushSubscription[]>;
  findAll(): Promise<PushSubscription[]>;
  upsertByEndpoint(
    data: Omit<PushSubscription, 'id' | 'createdAt'>,
  ): Promise<PushSubscription>;
  deleteByEndpoint(endpoint: string, userId: string): Promise<boolean>;
  deleteByEndpointOnly(endpoint: string): Promise<void>;
  /** D-030 — odhlášení konkrétního zařízení ze seznamu (jen vlastníkem). */
  deleteByIdAndUser(id: string, userId: string): Promise<boolean>;
  /** GDPR — hard-delete účtu: smaž všechny subscriptions uživatele. */
  deleteByUserId(userId: string): Promise<void>;
}
