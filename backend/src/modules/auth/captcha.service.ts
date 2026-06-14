import { Injectable, Logger } from '@nestjs/common';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * D-011 — Cloudflare Turnstile captcha verification.
 *
 * Při prvním nasazení do produkce vygeneruj reálné keys v Cloudflare dashboardu
 * → Turnstile → Add site. Pro dev jsou v `.env.example` test keys, které vždy
 * projdou:
 *   - TURNSTILE_SITE_KEY=1x00000000000000000000AA
 *   - TURNSTILE_SECRET=1x0000000000000000000000000000000AA
 *
 * V produkci (`NODE_ENV=production`) bez `TURNSTILE_SECRET` service vrátí `false`
 * (fail-closed) → registrace selže 400 CAPTCHA_FAILED. Tj. captcha nelze v produkci
 * tiše vypnout. Mimo produkci (dev/test) bez secretu vrací `true` (bypass + warning).
 * Navíc `env.validation` vyžaduje `TURNSTILE_SECRET` jako povinný v produkci.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly verifyUrl =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  /**
   * Vrátí true pokud Turnstile token je validní.
   * - Pokud `TURNSTILE_SECRET` není v env: v produkci → false (fail-closed),
   *   mimo produkci → true (DEV bypass + warning).
   * - Pokud `token` je prázdný → vrátí false.
   * - Při síťové chybě Cloudflare → vrátí false (fail-closed) + log.
   */
  async verify(token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const secret = process.env.TURNSTILE_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'TURNSTILE_SECRET není v produkci nastaven — captcha odmítnuta (fail-closed).',
        );
        return false;
      }
      this.logger.warn(
        'TURNSTILE_SECRET not configured — captcha disabled (DEV only).',
      );
      return true;
    }
    try {
      const params = new URLSearchParams();
      params.set('secret', secret);
      params.set('response', token);
      const res = await fetch(this.verifyUrl, {
        method: 'POST',
        body: params,
      });
      const data = (await res.json()) as TurnstileVerifyResponse;
      if (!data.success) {
        this.logger.warn(
          `Captcha verify failed: ${(data['error-codes'] ?? []).join(', ')}`,
        );
      }
      return data.success === true;
    } catch (err) {
      this.logger.error('Captcha verify network error', err as Error);
      return false;
    }
  }
}
