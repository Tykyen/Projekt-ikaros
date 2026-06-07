export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * D-030 — bezpečný výřez pro FE seznam zařízení. BEZ kryptografických klíčů
 * (`p256dh`/`auth`) — ty se z BE ven nikdy neposílají.
 */
export interface PushSubscriptionSummary {
  id: string;
  endpoint: string;
  userAgent?: string;
  createdAt: Date;
  lastUsedAt: Date;
}
