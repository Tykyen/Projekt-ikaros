export interface TrustedDevice {
  id: string;
  userId: string;
  tokenHash: string;
  label: string;
  lastUsedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

/** Veřejný tvar pro FE výpis „Důvěryhodná zařízení" (bez tokenHash). */
export interface TrustedDeviceView {
  id: string;
  label: string;
  lastUsedAt: Date;
  createdAt: Date;
  /** True = záznam odpovídá trust cookie aktuálního požadavku. */
  current: boolean;
}
