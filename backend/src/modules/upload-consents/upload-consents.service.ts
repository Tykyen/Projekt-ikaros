import { Inject, Injectable, Logger } from '@nestjs/common';
import { logWarn } from '../../common/logging/log-error.util';
import type {
  IUploadConsentsRepository,
  RecordUploadConsentInput,
  UploadConsent,
} from './interfaces/upload-consent.interface';

/**
 * Spec 20D (D3) — služba audit logu souhlasů při uploadu.
 *
 * `record()` je best-effort: selhání zápisu NESMÍ shodit samotný upload
 * (obrázek už existuje). Chybu jen zalogujeme — consent je doklad navíc,
 * ne blokující krok toku.
 */
@Injectable()
export class UploadConsentsService {
  // Zrcadlí AuthService.TERMS_VERSION (source of truth). Použije se jen jako
  // fallback pro uživatele bez uložené `termsVersion` (legacy účty).
  static readonly DEFAULT_TERMS_VERSION = '1.0';

  private readonly logger = new Logger(UploadConsentsService.name);

  constructor(
    @Inject('IUploadConsentsRepository')
    private readonly repo: IUploadConsentsRepository,
  ) {}

  /** Zapíše doklad souhlasu. Vždy `rightsDeclared: true` (volá se jen s consentem). */
  async record(input: RecordUploadConsentInput): Promise<void> {
    try {
      await this.repo.create({
        userId: input.userId,
        targetType: input.targetType,
        targetId: input.targetId,
        action: 'upload',
        rightsDeclared: true,
        aiDeclared: input.aiDeclared,
        termsVersion:
          input.termsVersion || UploadConsentsService.DEFAULT_TERMS_VERSION,
        ip: input.ip,
        createdAtUtc: new Date(),
      });
    } catch (err) {
      logWarn(this.logger, 'zápis upload consentu selhal', err);
    }
  }

  findByUser(userId: string): Promise<UploadConsent[]> {
    return this.repo.findByUser(userId);
  }
}
