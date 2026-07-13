import { BadRequestException } from '@nestjs/common';

/**
 * D-SEC-GAP „ekonomika na float" — sdílené peněžní helpery.
 *
 * Částky/zůstatky jsou JS čísla (IEEE-754 double) → binární drift
 * (0.1 + 0.2 = 0.30000000000000004) se bez zásahu hromadí v uložených
 * hodnotách a overdraft guard pak může selhat na haléřích. Plná migrace na
 * celočíselné minor units je velká + riskantní (data) — místo toho
 * KONZERVATIVNÍ mitigace: každá zapisovaná peněžní hodnota (delta / balance /
 * kurzový výsledek) projde `roundMoney` PŘED uložením a porovnání krytí jde
 * přes `gteMoney` (epsilon tolerance). Historická data se NEpřepočítávají —
 * existující drift v DB zůstává, nové operace ho nepřidávají.
 *
 * Přesnost: 4 desetinná místa — sjednoceno s existující konvencí `round4`
 * (kurzové převody v `changeCurrency` / `campaign-purchase` / `convert`).
 * Herní měny mají kurzy typu 0.01 (Měďák→Zlaťák), takže ceny s až 4 des.
 * místy jsou legitimní; hrubší zaokrouhlení (2 des.) by je zkreslilo
 * (0.0085 ZL → 0.01) nebo srazilo na 0 (položka zdarma).
 */

/** Počet desetinných míst peněžní přesnosti (viz hlavička souboru). */
export const MONEY_DECIMALS = 4;

/** 10^MONEY_DECIMALS — celočíselný faktor pro zaokrouhlovací trik. */
const MONEY_FACTOR = 10 ** MONEY_DECIMALS;

/**
 * Tolerance porovnání PO zaokrouhlení. Řádově hluboko pod peněžní
 * granularitou (1e-4), takže reálný overdraft neumožní — absorbuje jen
 * binární šum ULP a drobný historický drift v DB.
 */
export const MONEY_EPSILON = 1e-9;

/**
 * Zaokrouhlí peněžní hodnotu na `MONEY_DECIMALS` přes celočíselný trik
 * (`Math.round(n * 1e4) / 1e4`). Vstup musí být konečné číslo — na untrusted
 * vstupu nejdřív `assertFiniteMoney`.
 */
export function roundMoney(n: number): number {
  const rounded = Math.round(n * MONEY_FACTOR) / MONEY_FACTOR;
  // -0 → 0 (jinak Object.is(-0) prosákne do DB/JSON a mate porovnání).
  return rounded === 0 ? 0 : rounded;
}

/** Součet dvou peněžních hodnot se zaokrouhlením výsledku (drift se nehromadí). */
export function addMoney(a: number, b: number): number {
  return roundMoney(a + b);
}

/**
 * Peněžní `a >= b` s epsilon tolerancí PO zaokrouhlení obou stran.
 * `gteMoney(0.30000000000000004, 0.3) === true` — overdraft guard nesmí
 * selhat na binárním šumu / historickém driftu.
 */
export function gteMoney(a: number, b: number): boolean {
  return roundMoney(a) - roundMoney(b) >= -MONEY_EPSILON;
}

/**
 * Validace untrusted peněžního vstupu. Vrací hodnotu jako číslo, jinak
 * `BadRequestException` s daným kódem.
 *
 * CH-122 (PT-46d-bypass) — string `"9e9"` prošel HP clampem přes JS type
 * juggling. Peněžní vstup proto NEcoercujeme ze stringu: ne-číslo (string /
 * null / boolean / objekt) = reject rovnou, pak `Number()` normalizace
 * a `isFinite` reject NaN/±Infinity.
 */
export function assertFiniteMoney(
  value: unknown,
  code = 'AMOUNT_INVALID',
): number {
  if (typeof value !== 'number')
    throw new BadRequestException({
      code,
      message: 'Částka musí být číslo.',
    });
  const n = Number(value);
  if (!Number.isFinite(n))
    throw new BadRequestException({
      code,
      message: 'Částka musí být konečné číslo.',
    });
  return n === 0 ? 0 : n;
}
