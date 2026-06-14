import { validateEnv } from './env.validation';

/** Kompletní validní produkční konfigurace (báze pro negativní mutace). */
const PROD_OK = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://db:27017/ikaros',
  JWT_SECRET: 'a-real-secret',
  JWT_REFRESH_SECRET: 'a-different-secret',
  FRONTEND_URL: 'https://app.projekt-ikaros.com',
  BACKEND_BASE_URL: 'https://api.projekt-ikaros.com',
  TURNSTILE_SECRET: 'turnstile-secret',
  MEILI_API_KEY: 'meili-key',
};

describe('validateEnv (PC-03/24 fail-fast)', () => {
  it('dev/test: projde i s prázdným env (žádné tvrdé brány)', () => {
    expect(validateEnv({ NODE_ENV: 'development' })).toBeTruthy();
    expect(validateEnv({})).toBeTruthy();
  });

  it('prod: kompletní validní konfigurace projde', () => {
    expect(validateEnv({ ...PROD_OK })).toEqual(PROD_OK);
  });

  it.each([
    'MONGODB_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'FRONTEND_URL',
    'BACKEND_BASE_URL',
    'TURNSTILE_SECRET',
    'MEILI_API_KEY',
  ])('prod: hodí, když chybí kritická %s', (key) => {
    const cfg = { ...PROD_OK };
    delete (cfg as Record<string, unknown>)[key];
    expect(() => validateEnv(cfg)).toThrow(new RegExp(key));
  });

  it('prod: hodí, když prod URL míří na localhost', () => {
    expect(() =>
      validateEnv({ ...PROD_OK, FRONTEND_URL: 'http://localhost:5173' }),
    ).toThrow(/localhost/);
    expect(() =>
      validateEnv({ ...PROD_OK, BACKEND_BASE_URL: 'http://127.0.0.1:3000' }),
    ).toThrow(/localhost|127\.0\.0\.1|nepřípustné/);
  });

  it('prod: prázdný řetězec se počítá jako chybějící', () => {
    expect(() => validateEnv({ ...PROD_OK, JWT_SECRET: '   ' })).toThrow(
      /JWT_SECRET/,
    );
  });
});
