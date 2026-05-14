import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';

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
});
