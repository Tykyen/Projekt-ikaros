import type {
  SecurityToken,
  SecurityTokenType,
} from './security-token.interface';

export interface CreateSecurityTokenInput {
  tokenHash: string;
  userId: string;
  type: SecurityTokenType;
  meta?: Record<string, unknown>;
  expiresAt: Date;
}

export interface ISecurityTokensRepository {
  save(input: CreateSecurityTokenInput): Promise<SecurityToken>;
  findByHash(tokenHash: string): Promise<SecurityToken | null>;
  markUsed(id: string, usedAt: Date): Promise<void>;
  /**
   * Označí všechny nepoužité tokeny daného typu pro userId jako použité (= invalidace).
   * Použití: při issue nového tokenu se zruší předchozí (1 active per user+type).
   */
  invalidateAllByUserAndType(
    userId: string,
    type: SecurityTokenType,
  ): Promise<void>;
}
