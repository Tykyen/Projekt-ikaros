/**
 * Env validace při startu (PC-03 / PC-24 — production-config-audit).
 *
 * `ConfigModule.forRoot({ validate })` ji spustí na celý `process.env` při bootu.
 * Když hodí, aplikace **nenastartuje** (fail-fast) — místo aby tiše běžela
 * s vývojovým fallbackem (localhost / prázdný klíč / vypnutá captcha).
 *
 * Záměrně bez závislosti (joi/zod nejsou v projektu) — prostá funkce.
 *
 * Pravidlo: v `NODE_ENV=production` jsou KRITICKÉ proměnné povinné a žádná
 * prod URL nesmí mířit na localhost. Mimo produkci se jen varuje (dev pohodlí).
 */

/** Kritické v produkci — bez nich app fail-fast nenastartuje. */
const REQUIRED_IN_PROD = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',
  'BACKEND_BASE_URL',
  'TURNSTILE_SECRET', // jinak captcha fail-closed odmítne registrace (PC-01)
  'MEILI_API_KEY', // search auth (PC-06)
];

/** Doporučené — chybění jen varuje (mají fallback / jsou volitelné). */
const RECOMMENDED_IN_PROD = [
  'CLOUDINARY_URL', // disk fallback existuje
  'VAPID_SUBJECT',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY', // push je volitelný
  'SMTP_HOST',
  'SMTP_USER', // bez nich mailer jen loguje
];

/** URL proměnné, které v produkci nesmí mířit na localhost (PC-02/04/05/10). */
const PROD_URLS = ['FRONTEND_URL', 'BACKEND_BASE_URL'];

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const isProd = config.NODE_ENV === 'production';
  if (!isProd) return config; // dev/test: žádné tvrdé brány

  const errors: string[] = [];

  for (const key of REQUIRED_IN_PROD) {
    const val = config[key];
    if (typeof val !== 'string' || val.trim() === '') {
      errors.push(`${key} chybí (povinné v produkci)`);
    }
  }

  for (const key of PROD_URLS) {
    const val = config[key];
    if (typeof val === 'string' && /localhost|127\.0\.0\.1/.test(val)) {
      errors.push(`${key}="${val}" míří na localhost (nepřípustné v produkci)`);
    }
  }

  if (errors.length) {
    throw new Error(
      `[env.validation] Produkční konfigurace neúplná:\n  - ${errors.join('\n  - ')}`,
    );
  }

  const missingRecommended = RECOMMENDED_IN_PROD.filter((k) => {
    const v = config[k];
    return typeof v !== 'string' || v.trim() === '';
  });
  if (missingRecommended.length) {
    console.warn(
      `[env.validation] Doporučené proměnné chybí (degradovaný režim): ${missingRecommended.join(', ')}`,
    );
  }

  return config;
}
