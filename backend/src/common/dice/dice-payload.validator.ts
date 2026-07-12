import { BadRequestException } from '@nestjs/common';

/**
 * Herní integrita (GI — dluh D-LAUNCH-GAP). Klient je autorita nad hodem kostky:
 * RNG (`secureRandomInt`) běží v prohlížeči a server `dicePayload` dřív ukládal
 * verbatim (DTO jen `@IsObject()`). Hráč tak mohl poslat `{sum:20, total:999}`
 * a všem se zobrazil pravý hod (render čte `payload.total`).
 *
 * Tenhle validátor hod NEGENERUJE (to = port celého FE roll enginu na BE +
 * rozbití okamžité 3D animace = Cesta B, vědomě odloženo jako follow-up dluh).
 * Místo toho payload OČISTÍ:
 *  - u **součtových** typů PŘEPÍŠE `sum`/`total` z hozených `faces` (klientovým
 *    číslům nevěří → `total:999` je zahozeno a dopočítá se pravda),
 *  - ověří, že `faces` jsou v mezích typu (`d20` → 1..20) a payload není nafouklý.
 *
 * **Systémové** typy s vlastní total-logikou (`2d6+` kde `sum≠Σfaces`, GURPS
 * roll-under, CoC percentile, success-pool `hits`, `mixed`, `flat`) se
 * NEpřepočítávají — server u nich validuje jen meze `faces` a rozsah výsledku
 * (u success-poolu navíc přepočítá `hits` z faces). Cílené podvody uvnitř těch
 * systémů a re-rolling (hráč hází lokálně dokola) zůstávají follow-up dluhem
 * (řešily by Cestu B).
 *
 * Vrací OČIŠTĚNÝ payload (nová kopie), nebo hodí `400 DICE_PAYLOAD_INVALID`
 * (ne tiché zahození — pokus se má poznat).
 */

const MAX_FACES = 100; // proti nafouklému payloadu (nejdelší legit = exploding kaskáda ~50)
const MAX_ABS_MODIFIER = 1000;
const MAX_ABS_TOTAL = 100_000; // strop výsledku u typů, kde total nepřepisujeme
const MAX_ABS_FACE_SPECIAL = 1000; // hrubý strop face u systémových typů

/** Počet stěn dle typu — jen pro součtové číselné kostky (sides zakódované v typu). */
const SIDES_BY_TYPE: Record<string, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  '3d6': 6,
  'd6+': 6,
};

const D100_TENS = new Set([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function clampModifier(mod: unknown): number {
  if (!isInt(mod)) return 0;
  return Math.max(-MAX_ABS_MODIFIER, Math.min(MAX_ABS_MODIFIER, mod));
}

function reject(reason: string): never {
  throw new BadRequestException({
    code: 'DICE_PAYLOAD_INVALID',
    message: `Neplatný hod kostkou: ${reason}`,
  });
}

export function sanitizeDicePayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    reject('payload není objekt');
  const p: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  const type = p.type;
  if (typeof type !== 'string') reject('chybí type');
  if (!Array.isArray(p.faces)) reject('chybí faces');
  const faces = p.faces as unknown[];
  if (faces.length > MAX_FACES) reject('příliš mnoho kostek');

  const modifier = clampModifier(p.modifier);
  if (p.modifier !== undefined) p.modifier = modifier;

  // ── Fate (symbolické tváře +/-/0) → přepočítat sum/total + overpressure ──
  if (type === 'fate') {
    if (faces.length !== 4) reject('fate má 4 kostky');
    let sum = 0;
    for (const f of faces) {
      if (f === '+' || f === 1) sum += 1;
      else if (f === '-' || f === -1) sum -= 1;
      else if (f === '0' || f === 0) continue;
      else reject('fate tvář mimo {+,-,0}');
    }
    const total = sum + modifier;
    p.sum = sum;
    p.total = total;
    // overpressure je odvozené (Fate bonus při total ≥ 7) → přepočítat, ať
    // nejde zfalšovat nezávisle na total.
    if ('overpressure' in p) p.overpressure = mapOverpressure(total);
    return p;
  }

  // ── flat (bez kostek — nelze ověřit, jen mezní rozsah) ──
  if (type === 'flat') {
    if (faces.length !== 0) reject('flat nemá kostky');
    if (!isInt(p.total) || Math.abs(p.total) > MAX_ABS_TOTAL)
      reject('flat total mimo rozsah');
    return p;
  }

  // Od teď musí být faces celá čísla.
  for (const f of faces) {
    if (!isInt(f)) reject('tvář není celé číslo');
  }
  const nums = faces as number[];

  // ── d100 (tens + ones) ──
  if (type === 'd100') {
    if (nums.length !== 2) reject('d100 = [tens, ones]');
    const [tens, ones] = nums;
    if (!D100_TENS.has(tens)) reject('d100 tens mimo {0,10,…,90}');
    if (ones < 0 || ones > 9) reject('d100 ones mimo 0..9');
    // CoC percentile: total = holý hod (NEsčítá modifier) → nepřepisujeme total.
    if (p.percentile !== undefined) {
      if (!isInt(p.total) || Math.abs(p.total) > MAX_ABS_TOTAL)
        reject('d100 total mimo rozsah');
      return p;
    }
    const sum = tens === 0 && ones === 0 ? 100 : tens + ones;
    p.sum = sum;
    p.total = sum + modifier;
    return p;
  }

  // Klasifikace: systémový typ s vlastní total-logikou (sum≠Σfaces / nesčítá mod).
  const isSpecial =
    type === '2d6+' || // sum = base ± delta ≠ Σfaces
    type === 'mixed' || // per-face typy + d100 stovka → Σfaces ≠ sum
    p.rollUnder !== undefined || // GURPS 3d6 pod cíl (total = sum)
    p.hits !== undefined; // success-pool (sum/total = hits)

  if (isSpecial) {
    // Meze faces (hrubé — přesné sides neznáme napříč mixed/exploding).
    for (const f of nums) {
      if (Math.abs(f) > MAX_ABS_FACE_SPECIAL) reject('tvář mimo rozsah');
    }
    if (!isInt(p.total) || Math.abs(p.total) > MAX_ABS_TOTAL)
      reject('total mimo rozsah');
    if (p.sum !== undefined && !isInt(p.sum)) reject('sum není číslo');
    // success-pool: přepočítat hits = počet faces ≥ threshold (sum/total = hits).
    if (p.hits !== undefined) {
      const threshold = isInt(p.hitThreshold) ? p.hitThreshold : 5;
      const hits = nums.filter((f) => f >= threshold).length;
      p.hits = hits;
      p.sum = hits;
      p.total = hits;
      if (p.ones !== undefined) p.ones = nums.filter((f) => f === 1).length;
    }
    return p;
  }

  // ── Součtové typy (d4..d20, 3d6, d6+ exploding, pool-dN součtový) ──
  let sides: number | null = SIDES_BY_TYPE[type] ?? null;
  if (sides === null && type.startsWith('pool-d')) {
    const n = parseInt(type.slice('pool-d'.length), 10);
    sides = Number.isInteger(n) && n > 0 ? n : null;
  }
  if (sides === null) reject(`neznámý typ hodu: ${type}`);
  for (const f of nums) {
    if (f < 1 || f > sides) reject(`tvář ${f} mimo 1..${sides}`);
  }
  const sum = nums.reduce((a, b) => a + b, 0);
  p.sum = sum;
  p.total = sum + modifier;
  return p;
}

/** Fate přetlak — bonus při total ≥ 7 (kopie FE `mapOverpressure`, drží drift). */
function mapOverpressure(total: number): number | null {
  if (total < 7) return null;
  if (total === 7) return 1;
  if (total === 8) return 2;
  if (total === 9) return 3;
  if (total === 10) return 5;
  if (total === 11) return 7;
  if (total === 12) return 9;
  return 12;
}
