/**
 * M-SHAPE (error-contract audit, 13. styl) — empirický důkaz tvaru chyby (L4).
 *
 * Izolovaná mini Nest app: REÁLNÝ `HttpExceptionFilter` + `ValidationPipe` v PRODUKČNÍ
 * konfiguraci (jako main.ts — vč. `forbidNonWhitelisted`) + probe controller, co hází
 * každý druh chyby. Žádná DB → deterministické, rychlé, bez flaky Mongo.
 *
 * Dokazuje: EC-01 (ne-HTTP mine filtr → tvar #3), EC-02 (validace EN + string[]),
 * EC-05 (statusCode v těle je mrtvé), tvar #1, 429, + pozitiva (filtr sjednocuje #1/#2).
 *
 * Běh:  npx jest --config ./test/jest-e2e.json error-contract
 */
import request from 'supertest';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  NotFoundException,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from '../src/common/pipes/validation-exception.factory';

class ProbeDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  name!: string;
}

@Controller('probe')
class ErrorProbeController {
  // tvar #1 — aplikační chyba s doménovým kódem
  @Get('app-error')
  appError() {
    throw new ForbiddenException({
      code: 'PROBE_DENIED',
      message: 'Nemáš přístup',
    });
  }

  // string message → filtr dá code = HttpStatus[status] (generický)
  @Get('string-error')
  stringError() {
    throw new NotFoundException('Položka nenalezena');
  }

  // statusCode:400 v těle, ale exception třída je 403 → filtr bere getStatus() (EC-05)
  @Get('statuscode-body')
  statusCodeBody() {
    throw new ForbiddenException({
      statusCode: 400,
      code: 'SC_TEST',
      message: 'x',
    });
  }

  // ne-HttpException → filtr (@Catch(HttpException)) ji NECHYTÁ (EC-01, tvar #3)
  @Get('uncaught')
  uncaught(): never {
    throw new Error('boom — interní detail co nesmí ven');
  }

  // 429 — ThrottlerException extends HttpException → projde filtrem
  @Get('throttled')
  throttled(): never {
    throw new ThrottlerException();
  }

  // raw HttpException se statusem (vzor friendships REJECTED_RECENTLY)
  @Get('raw-http')
  rawHttp(): never {
    throw new HttpException(
      { code: 'RAW_CODE', message: 'raw' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  // L9 fault injection — typická Mongoose chyba na nevalidním ObjectId (běžná v praxi)
  @Get('cast-error')
  castError(): never {
    throw new mongoose.Error.CastError('ObjectId', 'neni-objectid', '_id');
  }

  // L9 — duplicate key (unique index). SÉMANTICKY 409, ale jako ne-HTTP → projde jako 500
  @Get('duplicate-key')
  duplicateKey(): never {
    const e: Error & { code?: number } = new Error(
      'E11000 duplicate key error: email_1',
    );
    e.code = 11000;
    throw e;
  }

  // validace (tvar #2)
  @Post('validate')
  validate(@Body() _dto: ProbeDto) {
    return { ok: true };
  }
}

const ERROR_SHAPE = {
  error: {
    code: expect.any(String),
    message: expect.anything(),
    timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
  },
};

describe('Error contract — M-SHAPE (tvar chyby po drátě)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ErrorProbeController],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    // = main.ts (vč. forbidNonWhitelisted — helper app-factory ji NEMÁ, proto vlastní app)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory, // F2
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const srv = () => request(app.getHttpServer());

  // ── POZITIVA: jednotný tvar #1 ──
  it('✅ aplikační chyba {code,message} → {error:{code,message,timestamp}} + správný status', async () => {
    const res = await srv().get('/api/probe/app-error');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(ERROR_SHAPE);
    expect(res.body.error.code).toBe('PROBE_DENIED');
    expect(res.body.error.message).toBe('Nemáš přístup');
  });

  it('string message → code = HttpStatus[status] (generický fallback NOT_FOUND)', async () => {
    const res = await srv().get('/api/probe/string-error');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject(ERROR_SHAPE);
    expect(res.body.error.code).toBe('NOT_FOUND'); // ← FE nemůže field-mapovat (EC-07)
    expect(res.body.error.message).toBe('Položka nenalezena');
  });

  // ── EC-05: statusCode v těle je MRTVÉ pole ──
  it('🐛 EC-05: statusCode:400 v těle se IGNORUJE — status je 403 z exception třídy', async () => {
    const res = await srv().get('/api/probe/statuscode-body');
    expect(res.status).toBe(403); // NE 400 → potvrzuje že statusCode v těle nemá efekt
    expect(res.body.error.code).toBe('SC_TEST');
  });

  // ── EC-01: ne-HTTP chyba MINE filtr → tvar #3 ──
  it('✅ EC-01 OPRAVENO (F1): ne-HttpException (Error) → 500 v JEDNOTNÉM tvaru {error:{code:INTERNAL}}', async () => {
    const res = await srv().get('/api/probe/uncaught');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject(ERROR_SHAPE); // catch-all filtr ji teď obalí
    expect(res.body.error.code).toBe('INTERNAL');
    // LK: interní detail ('boom …') NESMÍ uniknout klientovi
    expect(JSON.stringify(res.body)).not.toContain('boom');
  });

  // ── 429 ──
  it('ThrottlerException (429) projde filtrem → {error:{code:TOO_MANY_REQUESTS}}', async () => {
    const res = await srv().get('/api/probe/throttled');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject(ERROR_SHAPE);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('raw HttpException s kódem → doménový code zachován', async () => {
    const res = await srv().get('/api/probe/raw-http');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RAW_CODE');
  });

  // ── EC-02 OPRAVENO (F2): code VALIDATION + CS ──
  // FIX-24 — `error.fields` (field-level mapping) odstraněno: FE ho nikde
  // nekonzumoval (0 výskytů `.error.fields`), mrtvé pole v kontraktu.
  it('✅ EC-02 OPRAVENO: validační chyba → code=VALIDATION + message[] (bez mrtvého fields)', async () => {
    const res = await srv()
      .post('/api/probe/validate')
      .send({ email: 'neni-email', name: '' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(ERROR_SHAPE);
    expect(res.body.error.code).toBe('VALIDATION'); // doménový → FE pozná validaci
    expect(res.body.error.fields).toBeUndefined(); // FIX-24 — mrtvé pole odstraněno
    expect(Array.isArray(res.body.error.message)).toBe(true); // zpětná kompat (toast)
  });

  it('✅ EC-02/LN OPRAVENO: validační hlášky jsou ČESKY', async () => {
    const res = await srv()
      .post('/api/probe/validate')
      .send({ email: 'x', name: '' });
    const joined = (res.body.error.message as string[]).join(' | ');
    expect(joined).toMatch(/povinné|e-mail|text|číslo/i); // CS
    expect(joined).not.toMatch(/must be an email|should not be empty/i); // ne EN default
  });

  it('✅ forbidNonWhitelisted: pole navíc → 400 CS „Neznámé pole"', async () => {
    const res = await srv()
      .post('/api/probe/validate')
      .send({ email: 'a@b.cz', name: 'x', hacker: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(JSON.stringify(res.body.error.message)).toMatch(/Neznámé pole/i);
  });

  // ── L9 FAULT INJECTION: reálné DB chyby — po F1 mapovány na správný status + tvar ──
  it('✅ EC-01/L9 OPRAVENO (F1): Mongoose CastError → 400 {error:{code:INVALID_ID}}', async () => {
    const res = await srv().get('/api/probe/cast-error');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(ERROR_SHAPE);
    expect(res.body.error.code).toBe('INVALID_ID');
    expect(JSON.stringify(res.body)).not.toContain('neni-objectid'); // neleakuje vstup
  });

  it('✅ EC-11 OPRAVENO (F1): duplicate key (E11000) → 409 {error:{code:DUPLICATE_KEY}}', async () => {
    const res = await srv().get('/api/probe/duplicate-key');
    expect(res.status).toBe(409); // sémanticky správný Conflict
    expect(res.body).toMatchObject(ERROR_SHAPE);
    expect(res.body.error.code).toBe('DUPLICATE_KEY');
  });

  // ── L8 FUZZ: ať pošlu na validační endpoint COKOLI, každá chyba má JEDNOTNÝ {error} wrapper ──
  it('L8 FUZZ: malformed payloady → každá chyba má {error:{code,message,timestamp}} (F1 invariant)', async () => {
    // Pokřivené JSON STRUKTURY (reálné útočné vektory). Primitiva (42/null/'str')
    // vynechána — rozbíjejí supertest klient, ne BE (nejsou validní JSON request body).
    const payloads: object[] = [
      {},
      [],
      [1, 2, 3],
      { email: 12345, name: {} },
      { email: ['a@b.cz'], name: [null] },
      JSON.parse('{"__proto__":{"polluted":true},"email":"x"}'),
      { email: 'a'.repeat(100000), name: 'x' }, // oversized
      { email: '𝕏𝕪𝕫', name: '  ' }, // unicode / null bytes
      { email: { nested: { deep: { very: 1 } } }, name: true },
      Object.assign([], { email: 'x' }),
    ];
    const offenders: Array<{ p: unknown; status: number; body: unknown }> = [];
    for (const p of payloads) {
      const res = await srv()
        .post('/api/probe/validate')
        .set('Content-Type', 'application/json')
        .send(p);
      // F1 invariant: každá chyba (4xx/5xx) nese jednotný error wrapper s kódem
      if (res.status >= 400 && !res.body?.error?.code) {
        offenders.push({ p, status: res.status, body: res.body });
      }
    }
    // Při selhání Jest vypíše obsah `offenders` (payload + body) v diffu.
    expect(offenders).toEqual([]);
  });
});
