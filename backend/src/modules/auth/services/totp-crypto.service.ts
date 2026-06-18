import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * 14.1 — šifrování TOTP secretu (AES-256-GCM).
 *
 * Na rozdíl od hesla se TOTP secret NEHASHUJE — server ho musí pokaždé číst,
 * aby spočítal očekávaný kód. Proto se v DB drží šifrovaně; klíč žije jen v env
 * (`TOTP_ENC_KEY`, 32 B base64). Únik DB sám o sobě 2FA neprolomí.
 *
 * Fail-closed (jako captcha.service): bez/špatného klíče nelze 2FA zapnout ani
 * ověřit (throw za běhu), ale BE běží — proto klíč není boot-fatal (env.validation
 * ho má jen v RECOMMENDED). 2FA je opt-in.
 */
@Injectable()
export class TotpCryptoService {
  private readonly logger = new Logger(TotpCryptoService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    this.key = TotpCryptoService.loadKey(config.get<string>('TOTP_ENC_KEY'));
    if (!this.key) {
      this.logger.warn(
        'TOTP_ENC_KEY není nastaven nebo nemá 32 B (base64) — 2FA setup bude fail-closed.',
      );
    }
  }

  private static loadKey(raw: string | undefined): Buffer | null {
    if (!raw) return null;
    try {
      const buf = Buffer.from(raw, 'base64');
      return buf.length === 32 ? buf : null;
    } catch {
      return null;
    }
  }

  /** True = klíč k dispozici (feature gate pro health / FE hint). */
  get isConfigured(): boolean {
    return this.key !== null;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException({
        code: 'TOTP_NOT_CONFIGURED',
        message: 'Dvoufaktorové ověření není na serveru nakonfigurováno.',
      });
    }
    return this.key;
  }

  /** Zašifruje plaintext secret → `"iv:tag:ciphertext"` (vše base64). */
  encryptSecret(plain: string): string {
    const key = this.requireKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      tag.toString('base64'),
      ct.toString('base64'),
    ].join(':');
  }

  /** Dešifruje `"iv:tag:ciphertext"` → plaintext secret. */
  decryptSecret(enc: string): string {
    const key = this.requireKey();
    const [ivB64, tagB64, ctB64] = enc.split(':');
    if (!ivB64 || !tagB64 || !ctB64) {
      throw new Error('Neplatný formát šifrovaného TOTP secretu.');
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
