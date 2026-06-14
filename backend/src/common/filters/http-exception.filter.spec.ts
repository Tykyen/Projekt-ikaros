import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { MulterError } from 'multer';
import { Error as MongooseError } from 'mongoose';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('vrátí error.code z HTTP status name pro string exception', () => {
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: 'Not found',
        }),
      }),
    );
  });

  it('propaguje custom doménový code z exception payloadu', () => {
    const exception = new HttpException(
      { statusCode: 409, message: 'Email již existuje', code: 'EMAIL_TAKEN' },
      HttpStatus.CONFLICT,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'EMAIL_TAKEN',
          message: 'Email již existuje',
        }),
      }),
    );
  });

  it('fallback na HTTP status name pokud payload nemá code', () => {
    const exception = new HttpException(
      { message: 'Bad input' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Bad input',
        }),
      }),
    );
  });

  it('ignoruje non-string code v payloadu (defenzivní fallback)', () => {
    const exception = new HttpException(
      { message: 'Konflikt', code: 42 },
      HttpStatus.CONFLICT,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'CONFLICT',
        }),
      }),
    );
  });

  // ── F1: catch-all větve (ne-HTTP chyby) ──

  it('MulterError LIMIT_FILE_SIZE → 413 FILE_TOO_LARGE (CS hláška)', () => {
    filter.catch(new MulterError('LIMIT_FILE_SIZE'), mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(413);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'FILE_TOO_LARGE' }),
      }),
    );
  });

  it('MulterError ostatní → 400 UPLOAD_ERROR (bez leaku EN multer textu)', () => {
    filter.catch(new MulterError('LIMIT_UNEXPECTED_FILE'), mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    const body = mockResponse.json.mock.calls[0][0];
    expect(body.error.code).toBe('UPLOAD_ERROR');
    expect(JSON.stringify(body)).not.toMatch(/unexpected field/i);
  });

  it('Mongoose CastError → 400 INVALID_ID (ne 500)', () => {
    const cast = new MongooseError.CastError('ObjectId', 'xx', '_id');
    filter.catch(cast, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json.mock.calls[0][0].error.code).toBe('INVALID_ID');
  });

  it('Mongo duplicate key (E11000) → 409 DUPLICATE_KEY (ne 500)', () => {
    const e: Error & { code?: number } = new Error('E11000 dup');
    e.code = 11000;
    filter.catch(e, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(409);
    expect(mockResponse.json.mock.calls[0][0].error.code).toBe('DUPLICATE_KEY');
  });

  it('neočekávaný Error → 500 INTERNAL, NEleakuje interní message', () => {
    filter.catch(new Error('tajný interní detail'), mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(500);
    const body = mockResponse.json.mock.calls[0][0];
    expect(body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('tajný interní detail');
  });

  it('VŠECHNY větve → jednotný tvar {error:{code,message,timestamp}}', () => {
    for (const ex of [
      new HttpException('x', 404),
      new MulterError('LIMIT_FILE_SIZE'),
      new MongooseError.CastError('ObjectId', 'x', '_id'),
      new Error('boom'),
    ]) {
      mockResponse.json.mockClear();
      filter.catch(ex, mockHost);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body).toHaveProperty('error.code');
      expect(body).toHaveProperty('error.message');
      expect(body).toHaveProperty('error.timestamp');
    }
  });
});
