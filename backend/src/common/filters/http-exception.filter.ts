import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception.getResponse();
    const isObject =
      typeof exceptionResponse === 'object' && exceptionResponse !== null;

    const message = isObject
      ? ((exceptionResponse as Record<string, unknown>).message ?? 'Error')
      : exceptionResponse;

    // Custom doménový code (např. 'EMAIL_TAKEN', 'USERNAME_TAKEN') přepíše
    // default HTTP status name (CONFLICT, BAD_REQUEST, …). Umožňuje FE
    // mapovat field-level chyby bez parsování textových hlášek.
    const customCode = isObject
      ? (exceptionResponse as Record<string, unknown>).code
      : undefined;

    response.status(status).json({
      error: {
        code:
          typeof customCode === 'string'
            ? customCode
            : (HttpStatus[status] ?? 'UNKNOWN_ERROR'),
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
