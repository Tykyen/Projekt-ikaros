import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { IUsersRepository } from '../../users/interfaces/users-repository.interface';
import type { User } from '../../users/interfaces/user.interface';
import { TotpCryptoService } from './totp-crypto.service';
import { TrustedDevicesService } from '../../trusted-devices/trusted-devices.service';

const BACKUP_CODE_COUNT = 10;
const TOTP_ISSUER = 'Projekt Ikaros';

/**
 * 14.1 — správa 2FA/TOTP. Setup uloží secret jako „pending" (enabled=false),
 * enable ho po ověření kódu aktivuje a vydá záložní kódy. verifyForLogin používá
 * login flow (TOTP kód NEBO jednorázový záložní kód).
 */
@Injectable()
export class TotpService {
  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly crypto: TotpCryptoService,
    private readonly trustedDevices: TrustedDevicesService,
  ) {
    // ±1 okno (±30 s) — tolerance posunu hodin telefonu vs. serveru.
    authenticator.options = { window: 1 };
  }

  /** Vygeneruje secret + QR. Secret uloží jako pending (enabled zůstává false). */
  async setup(userId: string): Promise<{ qrDataUrl: string; secret: string }> {
    const user = await this.requireUser(userId);
    const secret = authenticator.generateSecret();
    await this.usersRepo.update(userId, {
      totpSecretEnc: this.crypto.encryptSecret(secret),
      totpEnabled: false,
      twoFactorMethod: 'totp',
    });
    const uri = authenticator.keyuri(user.email, TOTP_ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(uri);
    return { qrDataUrl, secret };
  }

  /** Ověří kód proti pending secretu → aktivuje 2FA, vrátí záložní kódy (jednou). */
  async enable(
    userId: string,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.requireUser(userId);
    if (user.totpEnabled) {
      throw new ConflictException({
        code: 'TOTP_ALREADY_ENABLED',
        message: 'Dvoufaktorové ověření je už aktivní.',
      });
    }
    if (!user.totpSecretEnc) {
      throw new BadRequestException({
        code: 'TOTP_NO_PENDING_SETUP',
        message: 'Nejprve spusť nastavení (QR kód).',
      });
    }
    const secret = this.crypto.decryptSecret(user.totpSecretEnc);
    if (!this.verifyTotpCode(secret, code)) {
      throw new BadRequestException({
        code: 'TOTP_INVALID_CODE',
        message: 'Neplatný kód, zkus to znovu.',
      });
    }
    const { plain, hashes } = await this.generateBackupCodes();
    await this.usersRepo.update(userId, {
      totpEnabled: true,
      totpEnabledAt: new Date(),
      backupCodeHashes: hashes,
    });
    return { backupCodes: plain };
  }

  /** Vypne 2FA (re-auth heslem) + revokuje všechna důvěryhodná zařízení. */
  async disable(userId: string, password: string): Promise<{ ok: true }> {
    const user = await this.requireUser(userId);
    await this.assertPassword(user, password);
    await this.usersRepo.update(userId, {
      totpEnabled: false,
      totpSecretEnc: null,
      backupCodeHashes: [],
      totpEnabledAt: undefined,
    });
    await this.trustedDevices.revokeAllForUser(userId);
    return { ok: true };
  }

  /** Re-auth heslem → nová sada záložních kódů (přepíše staré). */
  async regenerateBackupCodes(
    userId: string,
    password: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.requireUser(userId);
    await this.assertPassword(user, password);
    if (!user.totpEnabled) {
      throw new BadRequestException({
        code: 'TOTP_NOT_ENABLED',
        message: 'Dvoufaktorové ověření není aktivní.',
      });
    }
    const { plain, hashes } = await this.generateBackupCodes();
    await this.usersRepo.update(userId, { backupCodeHashes: hashes });
    return { backupCodes: plain };
  }

  /**
   * Login flow — ověří 6místný TOTP kód NEBO jednorázový záložní kód.
   * Záložní kód se po použití odebere. Vrací boolean (volající řeší odpověď).
   */
  async verifyForLogin(user: User, code: string): Promise<boolean> {
    const normalized = (code ?? '').trim();
    if (/^\d{6}$/.test(normalized)) {
      if (!user.totpSecretEnc) return false;
      return this.verifyTotpCode(
        this.crypto.decryptSecret(user.totpSecretEnc),
        normalized,
      );
    }
    return this.consumeBackupCode(
      user,
      normalized.toLowerCase().replace(/\s+/g, ''),
    );
  }

  private verifyTotpCode(secret: string, code: string): boolean {
    try {
      return authenticator.verify({ token: code.trim(), secret });
    } catch {
      return false;
    }
  }

  private async consumeBackupCode(user: User, code: string): Promise<boolean> {
    const hashes = user.backupCodeHashes ?? [];
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(code, hashes[i])) {
        const remaining = hashes.filter((_, idx) => idx !== i);
        await this.usersRepo.update(user.id, { backupCodeHashes: remaining });
        return true;
      }
    }
    return false;
  }

  private async generateBackupCodes(): Promise<{
    plain: string[];
    hashes: string[];
  }> {
    const plain = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      crypto.randomBytes(5).toString('hex'),
    );
    const hashes = await Promise.all(plain.map((c) => bcrypt.hash(c, 10)));
    return { plain, hashes };
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen.',
      });
    }
    return user;
  }

  private async assertPassword(user: User, password: string): Promise<void> {
    const ok = await bcrypt.compare(password ?? '', user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'Nesprávné heslo.',
      });
    }
  }
}
