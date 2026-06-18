import type { TrustedDevice } from './trusted-device.interface';

export interface CreateTrustedDeviceInput {
  userId: string;
  tokenHash: string;
  label: string;
  expiresAt: Date;
}

export interface ITrustedDevicesRepository {
  save(input: CreateTrustedDeviceInput): Promise<TrustedDevice>;
  findByTokenHash(tokenHash: string): Promise<TrustedDevice | null>;
  findByUserId(userId: string): Promise<TrustedDevice[]>;
  touch(id: string, lastUsedAt: Date): Promise<void>;
  /** Smaže jen pokud `_id` patří `userId` (anti-IDOR). */
  deleteById(id: string, userId: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}
