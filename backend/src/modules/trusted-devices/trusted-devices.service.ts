import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { DAY_MS } from '../../common/constants/time.constants';
import type { ITrustedDevicesRepository } from './interfaces/trusted-devices-repository.interface';
import type {
  TrustedDevice,
  TrustedDeviceView,
} from './interfaces/trusted-device.interface';

@Injectable()
export class TrustedDevicesService {
  static readonly TTL_DAYS = 30;
  private readonly logger = new Logger(TrustedDevicesService.name);

  constructor(
    @Inject('ITrustedDevicesRepository')
    private readonly repo: ITrustedDevicesRepository,
  ) {}

  private hash(plain: string): string {
    return crypto.createHash('sha256').update(plain).digest('hex');
  }

  /**
   * Vytvoří důvěryhodné zařízení a vrátí PLAIN token (volající ho vloží do
   * `ikaros_td` cookie). V DB je jen hash.
   */
  async createForUser(userId: string, userAgent?: string): Promise<string> {
    const plain = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + TrustedDevicesService.TTL_DAYS * DAY_MS,
    );
    await this.repo.save({
      userId,
      tokenHash: this.hash(plain),
      label: this.labelFromUserAgent(userAgent),
      expiresAt,
    });
    return plain;
  }

  /**
   * Najde platné důvěryhodné zařízení dle plain tokenu z cookie pro daného
   * usera. Null = nedůvěryhodné → 2FA se vyžádá.
   */
  async match(
    plainToken: string | undefined,
    userId: string,
  ): Promise<TrustedDevice | null> {
    if (!plainToken) return null;
    const device = await this.repo.findByTokenHash(this.hash(plainToken));
    if (!device || device.userId !== userId) return null;
    if (device.expiresAt.getTime() < Date.now()) return null;
    return device;
  }

  async touch(id: string): Promise<void> {
    await this.repo.touch(id, new Date());
  }

  /** Výpis pro profil; `current` označí zařízení odpovídající trust cookie. */
  async list(
    userId: string,
    currentPlainToken?: string,
  ): Promise<TrustedDeviceView[]> {
    const currentHash = currentPlainToken ? this.hash(currentPlainToken) : null;
    const devices = await this.repo.findByUserId(userId);
    return devices.map((d) => ({
      id: d.id,
      label: d.label,
      lastUsedAt: d.lastUsedAt,
      createdAt: d.createdAt,
      current: currentHash !== null && d.tokenHash === currentHash,
    }));
  }

  async revoke(userId: string, id: string): Promise<void> {
    await this.repo.deleteById(id, userId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.deleteAllForUser(userId);
  }

  /**
   * Změna hesla revokuje všechna důvěryhodná zařízení (emituje se ze 3 míst —
   * reset, self-change, admin-reset). Bez revokace by trust přežil kompromitaci.
   */
  @OnEvent('user.password.changed')
  async handlePasswordChanged(payload: { userId: string }): Promise<void> {
    this.logger.log(
      `Password changed (userId=${payload.userId}) — revokuji důvěryhodná zařízení.`,
    );
    await this.revokeAllForUser(payload.userId);
  }

  /**
   * CD-RUN-3 — hard-delete účtu uklidí i důvěryhodná zařízení. Bez toho zůstanou
   * orphan záznamy keyed na userId (anonymizace user docu je nezmiňuje); TTL 30d
   * by je smazal později, tohle hned. GDPR-bezpečné (jen userId+hash+label).
   */
  @OnEvent('user.deletion.hardDeleted')
  async handleAccountHardDeleted(payload: { userId: string }): Promise<void> {
    this.logger.log(
      `Account hard-deleted (userId=${payload.userId}) — revokuji důvěryhodná zařízení.`,
    );
    await this.revokeAllForUser(payload.userId);
  }

  /** Hrubý label z User-Agent — pořadí detekce kvůli překryvům UA řetězců. */
  private labelFromUserAgent(ua?: string): string {
    if (!ua) return 'Neznámé zařízení';
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Prohlížeč';
    const os = /Windows/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iPod/.test(ua)
          ? 'iOS'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'OS';
    return `${browser} · ${os}`;
  }
}
