const VALID_TYPES = ['info', 'alert', 'system'] as const;
type WorldNewsType = (typeof VALID_TYPES)[number];

export interface MappedNews {
  _id: string;
  worldId: string | null;
  title: string;
  content: string;
  date: string;
  type: WorldNewsType;
  link?: string;
}

export type MapResult =
  | { ok: true; data: MappedNews }
  | { ok: false; reason: string };

export function normalizeWorldId(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw === '' || raw === 'MatrixWorldId') return null;
  return raw;
}

interface LegacyItem {
  _id?: { $oid?: string } | string;
  WorldId?: string | null;
  Title?: string;
  Content?: string;
  Date?: string;
  Type?: string;
  Link?: string;
}

function extractOid(id: LegacyItem['_id']): string | null {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && '$oid' in id && typeof id.$oid === 'string') {
    return id.$oid;
  }
  return null;
}

export function mapLegacyItem(raw: unknown): MapResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'item není objekt' };
  }
  const item = raw as LegacyItem;

  const _id = extractOid(item._id);
  if (!_id) return { ok: false, reason: '_id chybí nebo má neplatný formát' };

  if (!item.Title || typeof item.Title !== 'string') {
    return { ok: false, reason: 'Title chybí nebo není string' };
  }
  if (!item.Content || typeof item.Content !== 'string') {
    return { ok: false, reason: 'Content chybí nebo není string' };
  }
  if (!item.Date || typeof item.Date !== 'string') {
    return { ok: false, reason: 'Date chybí nebo není string' };
  }

  let type: WorldNewsType;
  if (item.Type === undefined) {
    type = 'info';
  } else if (VALID_TYPES.includes(item.Type as WorldNewsType)) {
    type = item.Type as WorldNewsType;
  } else {
    return {
      ok: false,
      reason: `Type '${item.Type}' není povoleno (info|alert|system)`,
    };
  }

  return {
    ok: true,
    data: {
      _id,
      worldId: normalizeWorldId(item.WorldId),
      title: item.Title,
      content: item.Content,
      date: item.Date,
      type,
      ...(item.Link ? { link: item.Link } : {}),
    },
  };
}
