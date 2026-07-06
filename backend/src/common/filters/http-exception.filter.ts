import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';
import { Error as MongooseError } from 'mongoose';

/**
 * Globální catch-all filtr — JEDINÝ zdroj tvaru chybové odpovědi (error-contract audit, F1).
 *
 * Každá chyba (HttpException, validační, throttler, upload/Multer, Mongoose, neočekávaná)
 * dorazí klientovi ve stejném tvaru:  `{ error: { code, message, timestamp } }`.
 *
 * `@Catch()` (bez argumentu) chytá VŠE — na rozdíl od dřívějšího `@Catch(HttpException)`,
 * kvůli kterému ne-HTTP chyby (Mongoose CastError, duplicate key, runtime Error) propadávaly
 * na NestJS default handler a klient dostal cizí tvar `{statusCode,message}` (EC-01/10/11).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const { status, code, message } = this.resolve(exception);

    const error: Record<string, unknown> = {
      code,
      message,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json({ error });
  }

  private resolve(exception: unknown): {
    status: number;
    code: string;
    message: unknown;
  } {
    // 1) HttpException — vč. ValidationPipe (BadRequest) a ThrottlerException.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const isObject =
        typeof exceptionResponse === 'object' && exceptionResponse !== null;

      const message = isObject
        ? ((exceptionResponse as Record<string, unknown>).message ?? 'Error')
        : exceptionResponse;

      // Custom doménový code (např. 'EMAIL_TAKEN') přepíše default HTTP status name.
      const customCode = isObject
        ? (exceptionResponse as Record<string, unknown>).code
        : undefined;
      const code =
        typeof customCode === 'string'
          ? customCode
          : (HttpStatus[status] ?? 'UNKNOWN_ERROR');

      return { status, code, message };
    }

    // 2) Multer (upload limity / typy) — sloučeno z bývalého MulterExceptionFilter (EC-10).
    //    Žádný leak `error.message` (EN multer text), lokalizovaná CS hláška.
    if (exception instanceof MulterError) {
      if (exception.code === 'LIMIT_FILE_SIZE') {
        return {
          status: 413,
          code: 'FILE_TOO_LARGE',
          message: 'Soubor je příliš velký (max 50 MB)',
        };
      }
      return {
        status: 400,
        code: 'UPLOAD_ERROR',
        message: 'Nahrání souboru se nezdařilo',
      };
    }

    // 3) Mongoose CastError (nevalidní ObjectId v parametru apod.) → 400, ne 500 (EC-01).
    if (exception instanceof MongooseError.CastError) {
      return {
        status: 400,
        code: 'INVALID_ID',
        message: 'Neplatný identifikátor',
      };
    }

    // 4) Mongo duplicate key (porušení unique indexu) → 409 Conflict, ne 500 (EC-11).
    if (this.isDuplicateKey(exception)) {
      return {
        status: 409,
        code: 'DUPLICATE_KEY',
        message: 'Záznam již existuje',
      };
    }

    // 5) FIX-52 — oversized request body (`raw-body`/body-parser limit, vzniká
    //    dřív než routing → není HttpException) padal do generické 500 větve.
    //    `raw-body` nastavuje `.status/.statusCode = 413` a `.type = 'entity.too.large'`.
    if (this.hasStatus(exception, 413)) {
      return {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Požadavek je příliš velký',
      };
    }

    // 6) FIX-53 — malformed JSON tělo (body-parser `entity.parse.failed`) →
    //    syrová EN V8 SyntaxError věta klientovi. Detekce jen přes stabilní
    //    `.type`, ne přes obsah zprávy (false-positive risk).
    if (this.hasType(exception, 'entity.parse.failed')) {
      return {
        status: 400,
        code: 'INVALID_JSON',
        message: 'Neplatný formát požadavku (JSON)',
      };
    }

    // 7) Cokoli ostatní = neočekávaná chyba. Zaloguj server-side (jinak slepá v prod),
    //    klientovi generická CS hláška BEZ interních detailů / stacku (EC-01, LK).
    this.logger.error(
      exception instanceof Error
        ? `${exception.name}: ${exception.message}`
        : `Non-error thrown: ${String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    return {
      status: 500,
      code: 'INTERNAL',
      message: 'Vnitřní chyba serveru',
    };
  }

  private isDuplicateKey(e: unknown): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      (e as { code?: unknown }).code === 11000
    );
  }

  private hasStatus(e: unknown, status: number): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      ((e as { status?: unknown }).status === status ||
        (e as { statusCode?: unknown }).statusCode === status)
    );
  }

  private hasType(e: unknown, type: string): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      (e as { type?: unknown }).type === type
    );
  }
}
