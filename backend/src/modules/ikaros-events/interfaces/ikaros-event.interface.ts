/**
 * Spec 2.1b — účastník akce v API response (jméno joinnuté z Users).
 */
export interface IkarosEventAttendee {
  userId: string;
  userName: string;
}

/**
 * DB entity. `authorName` je legacy denormalizovaný snapshot — nové zápisy
 * ho neukládají, username se joinuje z Users při čtení (viz IkarosNews).
 */
export interface IkarosEventItem {
  id: string;
  title: string;
  /** Kdy se akce koná. */
  date: Date;
  description?: string;
  imageUrl?: string;
  /** 2.1b-focal — střed výřezu obrázku 0–100 %. */
  imageFocalX?: number;
  imageFocalY?: number;
  /** 9.5+ — zoom obrázku v procentech (25–400, default null = 100 = cover). */
  imageZoom?: number;
  /** 9.5+ — fit režim ('cover' default, 'contain' = vidět celý). */
  imageFit?: 'cover' | 'contain';
  /** Je u akce povoleno potvrzování účasti (RSVP)? */
  confirmable: boolean;
  /** Seznam userId, kteří potvrdili účast. */
  attendeeUserIds: string[];
  authorId: string;
  authorName?: string;
  createdAtUtc: Date;
  /** Soft-delete flag. `false` = smazaná akce. */
  isActive: boolean;
}

/**
 * API response — závazný kontrakt FE typu `IkarosEvent`. `date` i `createdAtUtc`
 * se serializují do ISO stringu (JSON). `myRsvp` je odvozeno per request user.
 */
export interface IkarosEventResponse {
  id: string;
  title: string;
  date: Date;
  description: string;
  imageUrl: string | null;
  imageFocalX: number | null;
  imageFocalY: number | null;
  imageZoom: number | null;
  imageFit: 'cover' | 'contain' | null;
  confirmable: boolean;
  confirmedCount: number;
  confirmedBy: IkarosEventAttendee[];
  myRsvp: 'confirmed' | 'none';
  authorId: string;
  authorName: string;
  createdAtUtc: Date;
  isActive: boolean;
}
