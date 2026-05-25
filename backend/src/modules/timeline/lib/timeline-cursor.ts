import { BadRequestException } from '@nestjs/common';

/**
 * 9.3 — kompozitní cursor pro stránkování timeline.
 *
 * `hour` může být `null` v DB; pro porovnávání používáme sentinel `-1`
 * (před hodinou 0). To zachovává totální uspořádání bez ambiguity.
 */
export interface TimelineCursor {
  year: number;
  month: number;
  day: number;
  /** `-1` pro null hodinu (pre-zero sentinel pro lexicografické porovnání). */
  hour: number;
  /** Mongo ObjectId tie-break (stejný den + hodina = řadit dle id). */
  id: string;
}

export type TimelineSort = 'asc' | 'desc';

export function encodeCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): TimelineCursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR',
      message: 'Neplatný cursor (nelze dekódovat)',
    });
  }
  if (!isTimelineCursor(parsed)) {
    throw new BadRequestException({
      code: 'INVALID_CURSOR',
      message: 'Neplatný cursor (chybný tvar)',
    });
  }
  return parsed;
}

function isTimelineCursor(v: unknown): v is TimelineCursor {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.year === 'number' &&
    typeof o.month === 'number' &&
    typeof o.day === 'number' &&
    typeof o.hour === 'number' &&
    typeof o.id === 'string'
  );
}

/**
 * Sestaví Mongo `$or` where clause pro lexikografické pokračování stránkování.
 *
 * DESC: chceme záznamy STARŠÍ než cursor → `(year, -month, -day, -hour, -id)`
 *       je _menší_ než cursor. V Mongo: rok DESC primární, jeden rok ASC
 *       v rámci (month/day/hour). Pro DESC pagination = další stránka =
 *       (rok < cur) OR (rok = cur AND v rámci roku ASC pokračování od
 *       (month, day, hour, id)).
 *
 * ASC: opačně — (rok > cur) OR (rok = cur AND (month, day, hour, id) > cur).
 */
export function buildCursorWhere(
  cursor: TimelineCursor,
  sort: TimelineSort,
): Record<string, unknown> {
  const { year, month, day, hour, id } = cursor;
  if (sort === 'desc') {
    // Year DESC, v rámci roku ASC (month/day/hour/id ASC pokračuje).
    return {
      $or: [
        { year: { $lt: year } },
        { year, month: { $gt: month } },
        { year, month, day: { $gt: day } },
        { year, month, day, hour: { $gt: hour } },
        { year, month, day, hour, _id: { $gt: id } },
      ],
    };
  }
  // ASC: rok ASC, v rámci roku ASC — strictly > cursor.
  return {
    $or: [
      { year: { $gt: year } },
      { year, month: { $gt: month } },
      { year, month, day: { $gt: day } },
      { year, month, day, hour: { $gt: hour } },
      { year, month, day, hour, _id: { $gt: id } },
    ],
  };
}
