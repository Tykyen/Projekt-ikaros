import { BadRequestException } from '@nestjs/common';
import {
  addMoney,
  assertFiniteMoney,
  gteMoney,
  MONEY_EPSILON,
  roundMoney,
} from './money.util';

/**
 * D-SEC-GAP „ekonomika na float" — spec sdílených peněžních helperů.
 * Cíl: 0.1+0.2 drift se do uložených hodnot nepropíše, overdraft guard
 * neselže na haléřích, NaN/Infinity/string se do peněz nedostane (CH-122).
 */
describe('money.util (D-SEC-GAP float)', () => {
  describe('roundMoney', () => {
    it('0.1 + 0.2 → přesně 0.3 (klasický IEEE-754 case)', () => {
      expect(0.1 + 0.2).not.toBe(0.3); // sanity: drift existuje
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    });

    it('drží 4 desetinná místa (herní kurzy 0.01 → ceny s des. místy)', () => {
      expect(roundMoney(0.0085)).toBe(0.0085);
      expect(roundMoney(0.00854)).toBe(0.0085);
      expect(roundMoney(0.00855000001)).toBe(0.0086);
    });

    it('zaokrouhluje záporné hodnoty symetricky k zápisu deltas', () => {
      expect(roundMoney(-(0.1 + 0.2))).toBe(-0.3);
    });

    it('-0 normalizuje na 0', () => {
      expect(Object.is(roundMoney(-0), 0)).toBe(true);
      expect(Object.is(roundMoney(-0.000001), 0)).toBe(true);
    });
  });

  describe('addMoney', () => {
    it('opakované +0.1 → přesně 0.3 i 1.0 (drift se nehromadí)', () => {
      let balance = 0;
      for (let i = 0; i < 3; i++) balance = addMoney(balance, 0.1);
      expect(balance).toBe(0.3);
      for (let i = 3; i < 10; i++) balance = addMoney(balance, 0.1);
      expect(balance).toBe(1);
    });

    it('vklad + výběr stejné částky → přesně 0', () => {
      const afterDeposit = addMoney(0, 0.3);
      expect(addMoney(afterDeposit, -0.3)).toBe(0);
    });
  });

  describe('gteMoney', () => {
    it('přesná hranice: balance 0.30, výběr 0.30 → projde', () => {
      expect(gteMoney(0.3, 0.3)).toBe(true);
    });

    it('toleruje binární šum v uložené balance (0.30000000000000004)', () => {
      expect(gteMoney(0.30000000000000004, 0.3)).toBe(true);
      expect(gteMoney(0.2999999999999999, 0.3)).toBe(true);
    });

    it('reálný nedostatek dál odmítá (žádný overdraft přes epsilon)', () => {
      expect(gteMoney(0.2999, 0.3)).toBe(false);
      expect(gteMoney(0, 0.0001)).toBe(false);
    });

    it('epsilon je hluboko pod peněžní granularitou', () => {
      expect(MONEY_EPSILON).toBeLessThan(0.0001 / 1000);
    });
  });

  describe('assertFiniteMoney (CH-122)', () => {
    it('vrací platné číslo beze změny', () => {
      expect(assertFiniteMoney(0.5)).toBe(0.5);
      expect(assertFiniteMoney(-12.3456)).toBe(-12.3456);
      expect(Object.is(assertFiniteMoney(-0), 0)).toBe(true);
    });

    it('reject NaN a ±Infinity', () => {
      expect(() => assertFiniteMoney(NaN)).toThrow(BadRequestException);
      expect(() => assertFiniteMoney(Infinity)).toThrow(BadRequestException);
      expect(() => assertFiniteMoney(-Infinity)).toThrow(BadRequestException);
    });

    it('reject string "9e9" (type-juggling bypass z CH-122) i jiné ne-číslo', () => {
      expect(() => assertFiniteMoney('9e9')).toThrow(BadRequestException);
      expect(() => assertFiniteMoney('0.5')).toThrow(BadRequestException);
      expect(() => assertFiniteMoney(null)).toThrow(BadRequestException);
      expect(() => assertFiniteMoney(undefined)).toThrow(BadRequestException);
      expect(() => assertFiniteMoney({})).toThrow(BadRequestException);
      expect(() => assertFiniteMoney(true)).toThrow(BadRequestException);
    });

    it('chybu vrací s daným error kódem (default AMOUNT_INVALID)', () => {
      const codeOf = (fn: () => void): string => {
        let caught: unknown;
        try {
          fn();
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(BadRequestException);
        return (
          (caught as BadRequestException).getResponse() as { code: string }
        ).code;
      };
      expect(codeOf(() => assertFiniteMoney(NaN))).toBe('AMOUNT_INVALID');
      expect(
        codeOf(() => assertFiniteMoney(NaN, 'CURRENCY_RATE_MISSING')),
      ).toBe('CURRENCY_RATE_MISSING');
    });
  });
});
