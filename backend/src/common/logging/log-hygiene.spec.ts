import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { logError, logWarn } from './log-error.util';
import { SmtpMailerProvider } from '../../modules/mailer/providers/smtp-mailer.provider';
import { LogMailerProvider } from '../../modules/mailer/providers/log-mailer.provider';

// M-RUNTIME (log-hygiene audit, L5) — empirický důkaz, že do logu neteče citlivá
// hodnota. Zachytíme VŠE, co kód předá Loggeru (= co NestJS zapíše na stdout),
// protlačíme rozpoznatelné KANÁRKY chybovou i mailer cestou a asertujeme, že v
// zachyceném výstupu nejsou. Zároveň slouží jako teeth: kdyby se redakce vrátila
// (logError → logger.error(msg, err) s celým objektem; mask zrušen; LogMailer
// prod gate odebrán), tyhle testy zčervenají.
//
// ⚠️ Kanárky jsou syntetické — žádná reálná data; nic se necommituje do logu.

jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }),
}));

const CANARY_EMAIL = 'canary@leak.test';
const CANARY_PWD = 'CANARY_PWD_x9';
const CANARY_TOKEN = 'CANARYTOKEN0123456789abcdef';
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./; // hrubý JWT vzor

describe('log hygiene — M-RUNTIME (žádný leak do logu) + teeth', () => {
  const captured: unknown[] = [];
  const collect = (...a: unknown[]) => {
    captured.push(...a);
  };
  let spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    captured.length = 0;
    spies = [
      jest.spyOn(Logger.prototype, 'error').mockImplementation(collect),
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(collect),
      jest.spyOn(Logger.prototype, 'log').mockImplementation(collect),
    ];
  });
  afterEach(() => spies.forEach((s) => s.mockRestore()));

  // serializace zachycených argů; Error → enumerable own props se serializují
  // (takže předaný „celý objekt" s keyValue.email by se objevil).
  const dump = () => JSON.stringify(captured);

  const assertNoCanary = () => {
    const out = dump();
    expect(out).not.toContain(CANARY_EMAIL);
    expect(out).not.toContain(CANARY_PWD);
    expect(out).not.toContain(CANARY_TOKEN);
    expect(out).not.toMatch(JWT_RE);
    expect(out.toLowerCase()).not.toContain('passwordhash');
  };

  describe('logError / logWarn (LH-01)', () => {
    it('logError nepustí enumerable pole chyby (Mongo keyValue / password) — jen stack', () => {
      const logger = new Logger('Test');
      // Mongo-style chyba s enumerable citlivými poli
      const err = Object.assign(new Error('E11000 duplicate key'), {
        keyValue: { email: CANARY_EMAIL },
        password: CANARY_PWD,
      });
      logError(logger, 'write failed', err);
      assertNoCanary();
      // ale message se zaloguje (diagnostika zachována)
      expect(dump()).toContain('write failed');
    });

    it('logWarn poskládá jen err.message, ne celý objekt', () => {
      const logger = new Logger('Test');
      const err = Object.assign(new Error('boom'), {
        token: CANARY_TOKEN,
        email: CANARY_EMAIL,
      });
      logWarn(logger, 'op selhala', err);
      assertNoCanary();
      expect(dump()).toContain('op selhala');
    });

    it('non-Error throwable → String(err), žádný objektový dump', () => {
      const logger = new Logger('Test');
      logError(logger, 'weird', { secret: CANARY_TOKEN });
      // String({secret}) = "[object Object]" → kanárek se nepropíše
      assertNoCanary();
    });
  });

  describe('SmtpMailerProvider (LH-03) — e-mail maskovaný', () => {
    it('zaloguje maskovaný e-mail, ne plný', async () => {
      const cfg = {
        get: (k: string) =>
          ({
            SMTP_HOST: 'smtp.test',
            SMTP_USER: 'u@test',
            SMTP_PASS: 'p',
            SMTP_PORT: '587',
            FRONTEND_URL: 'https://app.test',
          })[k],
      } as unknown as ConfigService;
      const provider = new SmtpMailerProvider(cfg);
      await provider.send('password_reset', {
        to: CANARY_EMAIL,
        username: 'alice',
        token: CANARY_TOKEN,
      });
      assertNoCanary();
      expect(dump()).toContain('c***@'); // maskovaná stopa
    });
  });

  describe('LogMailerProvider (LH-04) — v produkci žádný obsah', () => {
    const orig = process.env.NODE_ENV;
    afterAll(() => {
      process.env.NODE_ENV = orig;
    });

    it('production → jen warn bez e-mailu/tokenu', async () => {
      process.env.NODE_ENV = 'production';
      const provider = new LogMailerProvider();
      await provider.send('password_reset', {
        to: CANARY_EMAIL,
        username: 'alice',
        token: CANARY_TOKEN,
      });
      assertNoCanary();
    });

    it('dev → detailní log povolen (token zkrácen)', async () => {
      process.env.NODE_ENV = 'test';
      const provider = new LogMailerProvider();
      await provider.send('password_reset', {
        to: CANARY_EMAIL,
        username: 'alice',
        token: CANARY_TOKEN,
      });
      // v dev se e-mail loguje (lokální log) — kanárek SMÍ být přítomen
      expect(dump()).toContain(CANARY_EMAIL);
      // ale token jen zkrácený, ne celý
      expect(dump()).not.toContain(CANARY_TOKEN);
    });
  });
});
