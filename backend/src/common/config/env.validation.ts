/**
 * Env validace při startu (PC-03 / PC-24 — production-config-audit).
 *
 * `ConfigModule.forRoot({ validate })` ji spustí na celý `process.env` při bootu.
 *
 * Filozofie (po deploy incidentu 2026-06-14): tvrdě (throw → app nenastartuje)
 * selhat JEN na tom, bez čeho aplikace **vůbec nemůže běžet** a nemá fallback
 * (DB, JWT secrety). Vše ostatní — chybějící URL, captcha, search klíč — jen
 * **varuje** (degradovaný režim), protože to má buď runtime ochranu (captcha
 * fail-closed v `captcha.service`) nebo bezpečný fallback. Cílem je odhalit
 * chybějící konfiguraci v logu, NE shodit deploy netechnickému uživateli.
 *
 * Záměrně bez závislosti (joi/zod nejsou v projektu) — prostá funkce.
 */

/** Skutečně fatální v produkci — bez nich BE stejně nenastartuje (DB/auth). */
const REQUIRED_IN_PROD = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

/**
 * Doporučené — chybění jen VARUJE (mají fallback / runtime ochranu):
 *  - FRONTEND_URL / BACKEND_BASE_URL — fallback localhost (FE↔BE pak nesedí, ale BE běží)
 *  - TURNSTILE_SECRET — captcha je fail-closed (registrace bez secretu v prod selže)
 *  - MEILI_API_KEY — search degraduje
 *  - CLOUDINARY_URL — disk fallback; VAPID — push volitelný; SMTP — mailer jen loguje
 */
const RECOMMENDED_IN_PROD = [
  'FRONTEND_URL',
  'BACKEND_BASE_URL',
  'TURNSTILE_SECRET',
  'MEILI_API_KEY',
  'CLOUDINARY_URL',
  'VAPID_SUBJECT',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'SMTP_HOST',
  'SMTP_USER',
];

/** URL proměnné, které by v produkci neměly mířit na localhost (jen varování). */
const PROD_URLS = ['FRONTEND_URL', 'BACKEND_BASE_URL'];

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const isProd = config.NODE_ENV === 'production';
  if (!isProd) return config; // dev/test: žádné brány

  // Tvrdá brána JEN na fatální (DB/auth) — bez nich app nemůže běžet.
  const fatal = REQUIRED_IN_PROD.filter((key) => {
    const val = config[key];
    return typeof val !== 'string' || val.trim() === '';
  });
  if (fatal.length) {
    throw new Error(
      `[env.validation] Chybí kritické proměnné (app nemůže běžet):\n  - ${fatal.join('\n  - ')}`,
    );
  }

  // Vše ostatní jen varuje — neblokuje start.
  const warnings: string[] = [];

  for (const key of PROD_URLS) {
    const val = config[key];
    if (typeof val === 'string' && /localhost|127\.0\.0\.1/.test(val)) {
      warnings.push(`${key}="${val}" míří na localhost (FE↔BE nebude sedět)`);
    }
  }

  const missingRecommended = RECOMMENDED_IN_PROD.filter((k) => {
    const v = config[k];
    return typeof v !== 'string' || v.trim() === '';
  });
  if (missingRecommended.length) {
    warnings.push(
      `chybí (degradovaný režim): ${missingRecommended.join(', ')}`,
    );
  }

  if (warnings.length) {
    console.warn(
      `[env.validation] Produkční konfigurace neúplná:\n  - ${warnings.join('\n  - ')}`,
    );
  }

  return config;
}
