import { Logger } from '@nestjs/common';

/**
 * LH-01 (log hygiene) — bezpečné logování chyby. Místo předání celého `err`
 * objektu (NestJS ho zaloguje syrově a Mongo/HTTP chyby nesou enumerable pole,
 * např. `keyValue` s e-mailem) normalizujeme na stack string / String(err).
 * Centrální místo → sem půjde případný scrubber.
 */
export function logError(logger: Logger, message: string, err: unknown): void {
  logger.error(message, err instanceof Error ? err.stack : String(err));
}

/**
 * Varianta pro `warn` úroveň — NestJS `Logger.warn` druhý argument bere jako
 * `context`, ne stack; proto chybu poskládáme do zprávy (jen message, bez stacku).
 */
export function logWarn(logger: Logger, message: string, err: unknown): void {
  logger.warn(
    `${message} — ${err instanceof Error ? err.message : String(err)}`,
  );
}
