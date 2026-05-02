import { Catch, ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    if (error.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ statusCode: 413, message: 'Soubor je příliš velký (max 50 MB)' });
    } else {
      response.status(400).json({ statusCode: 400, message: error.message });
    }
  }
}
