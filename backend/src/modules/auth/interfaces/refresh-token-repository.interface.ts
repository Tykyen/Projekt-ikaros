import { RefreshToken } from './refresh-token.interface';

export interface IRefreshTokenRepository {
  save(
    token: Omit<RefreshToken, 'createdAt'> & { createdAt?: Date },
  ): Promise<RefreshToken>;
  findByJti(jti: string): Promise<RefreshToken | null>;
  revokeByJti(jti: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
