import { BadRequestException } from '@nestjs/common';
import { sanitizeDicePayload } from './dice-payload.validator';

/**
 * GI (D-LAUNCH-GAP) — server-side očista hodu kostkou. Klíč: klient nesmí být
 * autorita nad výsledkem (`total`). Testy pokrývají falšování, meze a to, že
 * legitimní hod projde beze změny.
 */
describe('sanitizeDicePayload', () => {
  const expectReject = (raw: unknown) =>
    expect(() => sanitizeDicePayload(raw)).toThrow(BadRequestException);

  describe('falšování výsledku (jádro díry)', () => {
    it('d20: total:999 se přepíše na skutečný součet faces', () => {
      const out = sanitizeDicePayload({
        type: 'd20',
        faces: [15],
        sum: 20,
        total: 999,
      });
      expect(out.sum).toBe(15);
      expect(out.total).toBe(15);
    });

    it('d20 s modifierem: total = Σfaces + modifier (ne klientův total)', () => {
      const out = sanitizeDicePayload({
        type: 'd20',
        faces: [12],
        sum: 12,
        total: 999,
        modifier: 3,
      });
      expect(out.total).toBe(15);
    });

    it('3d6 součtový: total přepsán z faces', () => {
      const out = sanitizeDicePayload({
        type: '3d6',
        faces: [4, 5, 6],
        sum: 99,
        total: 99,
      });
      expect(out.sum).toBe(15);
      expect(out.total).toBe(15);
    });
  });

  describe('meze faces', () => {
    it('d20 face mimo 1..20 → reject', () => {
      expectReject({ type: 'd20', faces: [21], sum: 21, total: 21 });
      expectReject({ type: 'd20', faces: [0], sum: 0, total: 0 });
      expectReject({ type: 'd6', faces: [999], sum: 999, total: 999 });
    });

    it('nefinální / ne-int face → reject', () => {
      expectReject({ type: 'd20', faces: [1.5], sum: 1.5, total: 1.5 });
      expectReject({ type: 'd20', faces: ['x'], sum: 0, total: 0 });
    });

    it('nafouklý payload (>100 faces) → reject', () => {
      const faces = Array(101).fill(1);
      expectReject({ type: 'pool-d6', faces, sum: 101, total: 101 });
    });
  });

  describe('modifier clamp', () => {
    it('extrémní modifier se ořízne na ±1000', () => {
      const out = sanitizeDicePayload({
        type: 'd20',
        faces: [10],
        sum: 10,
        total: 10,
        modifier: 999999,
      });
      expect(out.modifier).toBe(1000);
      expect(out.total).toBe(1010);
    });
  });

  describe('pool-dN součtový', () => {
    it('sečte faces, ověří meze dle N', () => {
      const out = sanitizeDicePayload({
        type: 'pool-d6',
        faces: [3, 5, 1],
        sum: 0,
        total: 0,
      });
      expect(out.sum).toBe(9);
      expect(out.total).toBe(9);
    });

    it('pool-d6 face 7 → reject', () => {
      expectReject({ type: 'pool-d6', faces: [7], sum: 7, total: 7 });
    });
  });

  describe('d6+ exploding (součtový, variabilní délka)', () => {
    it('kaskáda 6,6,3 → sum 15', () => {
      const out = sanitizeDicePayload({
        type: 'd6+',
        faces: [6, 6, 3],
        sum: 1,
        total: 1,
      });
      expect(out.sum).toBe(15);
      expect(out.total).toBe(15);
    });
  });

  describe('fate (symbolické tváře)', () => {
    it('+/-/0 přepočet na sum + overpressure při total ≥ 7', () => {
      const out = sanitizeDicePayload({
        type: 'fate',
        faces: ['+', '+', '0', '-'],
        sum: 99,
        total: 99,
        modifier: 0,
      });
      expect(out.sum).toBe(1); // +1 +1 +0 -1
      expect(out.total).toBe(1);
    });

    it('overpressure se přepočítá z total (nejde zfalšovat)', () => {
      const out = sanitizeDicePayload({
        type: 'fate',
        faces: ['+', '+', '+', '+'],
        sum: 4,
        total: 4,
        modifier: 5,
        overpressure: 999,
      });
      expect(out.total).toBe(9);
      expect(out.overpressure).toBe(3); // total 9 → 3
    });

    it('fate špatný počet kostek → reject', () => {
      expectReject({ type: 'fate', faces: ['+', '+'], sum: 2, total: 2 });
    });
  });

  describe('d100', () => {
    it('tens+ones součet, 00+0 → 100', () => {
      expect(
        sanitizeDicePayload({ type: 'd100', faces: [40, 3], sum: 0, total: 0 })
          .total,
      ).toBe(43);
      expect(
        sanitizeDicePayload({ type: 'd100', faces: [0, 0], sum: 0, total: 0 })
          .total,
      ).toBe(100);
    });

    it('tens mimo {0..90} → reject', () => {
      expectReject({ type: 'd100', faces: [45, 3], sum: 48, total: 48 });
    });

    it('CoC percentile: total (holý hod) se NEpřepisuje modifierem', () => {
      const out = sanitizeDicePayload({
        type: 'd100',
        faces: [30, 5],
        sum: 35,
        total: 35,
        modifier: 10,
        percentile: { target: 50, level: 'regular', success: true },
      });
      expect(out.total).toBe(35); // nesčítá mod
    });
  });

  describe('systémové typy (vlastní total-logika) → jen meze + rozsah', () => {
    it('2d6+ NEpřepisuje sum (sum ≠ Σfaces)', () => {
      const out = sanitizeDicePayload({
        type: '2d6+',
        faces: [6, 6, 5, 2],
        sum: 13,
        total: 13,
      });
      expect(out.sum).toBe(13); // ponecháno
    });

    it('2d6+ s absurdním total → reject', () => {
      expectReject({ type: '2d6+', faces: [6, 6], sum: 12, total: 10 ** 9 });
    });

    it('success-pool: hits se přepočítá z faces ≥ threshold', () => {
      const out = sanitizeDicePayload({
        type: 'pool-d6',
        faces: [5, 6, 2, 1, 5],
        sum: 99,
        total: 99,
        hits: 99,
        hitThreshold: 5,
        ones: 99,
      });
      expect(out.hits).toBe(3); // 5,6,5
      expect(out.total).toBe(3);
      expect(out.ones).toBe(1);
    });

    it('GURPS roll-under: total zůstává (nesčítá mod)', () => {
      const out = sanitizeDicePayload({
        type: '3d6',
        faces: [3, 4, 5],
        sum: 12,
        total: 12,
        modifier: 5,
        rollUnder: { target: 13, success: true, margin: 1 },
      });
      expect(out.total).toBe(12);
    });
  });

  describe('flat (bez kostek)', () => {
    it('projde, jen rozsah total', () => {
      const out = sanitizeDicePayload({
        type: 'flat',
        faces: [],
        sum: 8,
        total: 8,
      });
      expect(out.total).toBe(8);
    });
    it('flat s kostkami → reject', () => {
      expectReject({ type: 'flat', faces: [3], sum: 3, total: 3 });
    });
  });

  describe('základní tvar', () => {
    it('ne-objekt / chybějící pole → reject', () => {
      expectReject(null);
      expectReject('x');
      expectReject([]);
      expectReject({ faces: [1], sum: 1, total: 1 }); // chybí type
      expectReject({ type: 'd20', sum: 1, total: 1 }); // chybí faces
    });

    it('neznámý typ → reject', () => {
      expectReject({ type: 'd7', faces: [3], sum: 3, total: 3 });
    });
  });

  describe('legitimní hody projdou beze změny výsledku', () => {
    it('d20 legit', () => {
      const out = sanitizeDicePayload({
        type: 'd20',
        faces: [17],
        sum: 17,
        total: 17,
      });
      expect(out.total).toBe(17);
    });
    it('2d6 legit (pool)', () => {
      const out = sanitizeDicePayload({
        type: 'pool-d6',
        faces: [4, 3],
        sum: 7,
        total: 7,
      });
      expect(out.total).toBe(7);
    });
  });
});
