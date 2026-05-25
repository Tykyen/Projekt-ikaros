import {
  encodeCursor,
  decodeCursor,
  buildCursorWhere,
  type TimelineCursor,
} from './timeline-cursor';

const sample: TimelineCursor = {
  year: 1453,
  month: 5,
  day: 14,
  hour: 12,
  id: '507f1f77bcf86cd799439011',
};

describe('timeline-cursor', () => {
  describe('encode/decode', () => {
    it('round-trip preserves all fields', () => {
      const enc = encodeCursor(sample);
      expect(decodeCursor(enc)).toEqual(sample);
    });

    it('záporný rok (BC) round-trip', () => {
      const bc: TimelineCursor = { ...sample, year: -487 };
      expect(decodeCursor(encodeCursor(bc))).toEqual(bc);
    });

    it('hour=-1 (null sentinel) round-trip', () => {
      const noHour: TimelineCursor = { ...sample, hour: -1 };
      expect(decodeCursor(encodeCursor(noHour))).toEqual(noHour);
    });

    it('invalid base64 → BadRequestException INVALID_CURSOR', () => {
      expect(() => decodeCursor('@@@not-base64@@@')).toThrow(
        /INVALID_CURSOR|Neplatný cursor/,
      );
    });

    it('valid base64 ale jiný JSON shape → INVALID_CURSOR', () => {
      const bad = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString(
        'base64url',
      );
      expect(() => decodeCursor(bad)).toThrow(/Neplatný cursor/);
    });

    it('base64 ale není JSON → INVALID_CURSOR', () => {
      const garbage = Buffer.from('not-json', 'utf8').toString('base64url');
      expect(() => decodeCursor(garbage)).toThrow(/Neplatný cursor/);
    });
  });

  describe('buildCursorWhere — DESC (year DESC, in-year ASC)', () => {
    it('5-level $or pro DESC sort', () => {
      const where = buildCursorWhere(sample, 'desc') as {
        $or: Record<string, unknown>[];
      };
      expect(where.$or).toHaveLength(5);
      expect(where.$or[0]).toEqual({ year: { $lt: 1453 } });
      expect(where.$or[1]).toEqual({ year: 1453, month: { $gt: 5 } });
      expect(where.$or[2]).toEqual({ year: 1453, month: 5, day: { $gt: 14 } });
      expect(where.$or[3]).toEqual({
        year: 1453,
        month: 5,
        day: 14,
        hour: { $gt: 12 },
      });
      expect(where.$or[4]).toEqual({
        year: 1453,
        month: 5,
        day: 14,
        hour: 12,
        _id: { $gt: '507f1f77bcf86cd799439011' },
      });
    });
  });

  describe('buildCursorWhere — ASC (year ASC, in-year ASC)', () => {
    it('5-level $or pro ASC sort', () => {
      const where = buildCursorWhere(sample, 'asc') as {
        $or: Record<string, unknown>[];
      };
      expect(where.$or).toHaveLength(5);
      expect(where.$or[0]).toEqual({ year: { $gt: 1453 } });
      expect(where.$or[1]).toEqual({ year: 1453, month: { $gt: 5 } });
    });
  });
});
