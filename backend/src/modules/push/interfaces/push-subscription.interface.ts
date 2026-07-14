export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: Date;
  lastUsedAt: Date;
  /**
   * Doručovací hygiena — počet PO SOBĚ JDOUCÍCH trvalých selhání odeslání
   * (400/401/403/413, typicky VAPID mismatch po rotaci klíčů). Úspěšné
   * doručení nuluje; po prahu se záznam maže (jinak mrtvá subscription,
   * kterou provider nikdy nevrátí jako 404/410, žije věčně a plní log).
   */
  failCount?: number;
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
