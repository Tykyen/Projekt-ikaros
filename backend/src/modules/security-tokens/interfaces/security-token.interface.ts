export type SecurityTokenType =
  | 'password_reset'
  | 'email_verify'
  | 'email_change';

export interface SecurityToken {
  id: string;
  tokenHash: string;
  userId: string;
  type: SecurityTokenType;
  meta?: Record<string, unknown>;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface ConsumedToken {
  userId: string;
  meta?: Record<string, unknown>;
}
