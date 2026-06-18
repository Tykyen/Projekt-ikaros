import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import type { ISecurityTokensRepository } from './interfaces/security-tokens-repository.interface';
import type {
  SecurityTokenType,
  ConsumedToken,
} from './interfaces/security-token.interface';

@Injectable()
export class SecurityTokensService {
  constructor(
    @Inject('ISecurityTokensRepository')
    private readonly repo: ISecurityTokensRepository,
  ) {}

  /**
   * Vystaví nový token typu `type` pro `userId`. Plain token vrácený volajícímu
   * (nikdy v DB), hash uložen. Před uložením invaliduje všechny předchozí
   * nepoužité tokeny stejného typu (1× active per user+type).
   *
   * @param ttlMs Time-to-live v ms. Záporná hodnota vystaví okamžitě expirovaný
   *   token (validní pro testy, ne pro prod).
   */
  async issue(
    userId: string,
    type: SecurityTokenType,
    ttlMs: number,
    meta?: Record<string, unknown>,
  ): Promise<string> {
    await this.repo.invalidateAllByUserAndType(userId, type);
    const plain = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hash(plain);
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.repo.save({ tokenHash, userId, type, meta, expiresAt });
    return plain;
  }

  /**
   * Verifikuje token a označí jej jako použitý. Throws BadRequestException
   * s `code` rozlišujícím selhání:
   *   - `INVALID_TOKEN` — token neexistuje, typ neodpovídá, nebo input není string
   *   - `EXPIRED_TOKEN` — token existuje, ale expiresAt < now
   *   - `ALREADY_USED` — token byl už dříve konzumován / invalidován
   *
   * Pořadí kontrol: invalid > used > expired. (Pokud token vůbec není v DB,
   * nemůžeme říct, jestli byl použit/expiroval/neexistoval — všechny vrací
   * `INVALID_TOKEN`. Token v DB s usedAt vrací `ALREADY_USED` i když je
   * současně expirovaný — používání je informativnější než expirace.)
   */
  async consume(
    plainToken: string,
    type: SecurityTokenType,
  ): Promise<ConsumedToken> {
    if (!plainToken || typeof plainToken !== 'string') {
      throw this.invalidTokenException();
    }
    const tokenHash = this.hash(plainToken);
    const record = await this.repo.findByHash(tokenHash);
    if (!record) {
      throw this.invalidTokenException();
    }
    if (record.type !== type) {
      // Token existuje, ale jiného typu — z bezpečnostního hlediska
      // nesmí útočník použít password_reset token na email_verify endpoint.
      throw this.invalidTokenException();
    }
    if (record.usedAt) {
      throw new BadRequestException({
        message: 'Token byl už použit',
        code: 'ALREADY_USED',
      });
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        message: 'Token expiroval',
        code: 'EXPIRED_TOKEN',
      });
    }

    await this.repo.markUsed(record.id, new Date());
    return { userId: record.userId, meta: record.meta };
  }

  /**
   * 14.1 — jako `consume()`, ale token NEspotřebuje (neoznačí `usedAt`). Pro
   * flow, kde se stejný token ověřuje víckrát (TOTP challenge = víc pokusů o
   * kód, aniž by překlep zničil challenge). Volající po úspěchu zavolá
   * `consume()` sám. Brute-force chrání Throttler na endpointu + 5min TTL.
   */
  async peek(
    plainToken: string,
    type: SecurityTokenType,
  ): Promise<ConsumedToken> {
    if (!plainToken || typeof plainToken !== 'string') {
      throw this.invalidTokenException();
    }
    const tokenHash = this.hash(plainToken);
    const record = await this.repo.findByHash(tokenHash);
    if (!record || record.type !== type) {
      throw this.invalidTokenException();
    }
    if (record.usedAt) {
      throw new BadRequestException({
        message: 'Token byl už použit',
        code: 'ALREADY_USED',
      });
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        message: 'Token expiroval',
        code: 'EXPIRED_TOKEN',
      });
    }
    return { userId: record.userId, meta: record.meta };
  }

  /**
   * SHA-256 hash. Public — AuthService (SP2) může používat pro consistency.
   */
  hash(plain: string): string {
    return crypto.createHash('sha256').update(plain).digest('hex');
  }

  private invalidTokenException(): BadRequestException {
    return new BadRequestException({
      statusCode: 400,
      message: 'Token je neplatný',
      code: 'INVALID_TOKEN',
    });
  }
}
