/**
 * SSRF egress gate pro world-export (styl 32 / PT-32).
 *
 * Čistá logika bez závislostí (testovatelná unitem — service sama zatahuje
 * `archiver` ESM, který unit jest nemockuje). Rozhoduje, které URL z dat světa
 * smí server při exportu fetchnout a zabalit do ZIP.
 */

/** Max velikost jednoho staženého média do ZIP (SSRF/DoS pojistka). */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/**
 * URL na naše médium = JEN https na Cloudinary host (origin-allowlist).
 *
 * SSRF pojistka: dřívější substring-check (`includes('cloudinary')` nebo media
 * přípona) propouštěl JAKOUKOLI URL — PJ vlastního světa vložil na stránku
 * `http://169.254.169.254/x.png` a export mu bajty interní sítě (cloud metadata,
 * Redis, MeiliSearch) zabalil do ZIP ke stažení. Allowlist to uzavírá; cizí/
 * relativní/legacy URL se nefetchují (zůstávají v datech jako odkaz).
 * Pozn.: přidat další legitimní media-host = rozšířit tuto podmínku.
 */
export function isMediaUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com');
}
