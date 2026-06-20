import type { IkarosEventItem } from './ikaros-event.interface';

/** Spec 2.1b — partial update payload pro PUT /:id. */
export interface UpdateEventFields {
  title?: string;
  date?: Date;
  description?: string;
  /** `null` = odebrat obrázek. */
  imageUrl?: string | null;
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  confirmable?: boolean;
}

export interface IIkarosEventRepository {
  /** Všechny aktivní akce, sort `date` vzestupně. */
  findActive(): Promise<IkarosEventItem[]>;
  /** Nadcházející aktivní akce (`date >= now`), limit, sort `date` vzestupně. */
  findUpcoming(limit: number): Promise<IkarosEventItem[]>;
  findById(id: string): Promise<IkarosEventItem | null>;
  create(data: Omit<IkarosEventItem, 'id'>): Promise<IkarosEventItem>;
  /** Partial update. Vrací updated entity nebo null (neexistuje). */
  update(
    id: string,
    fields: UpdateEventFields,
  ): Promise<IkarosEventItem | null>;
  /** Hard delete (CD-RUN-4b 2026-06-20 — soft-delete `isActive=false` neměl
   * žádnou cestu k obnově, nahrazen tvrdým smazáním). Vrací false pokud neexistuje. */
  delete(id: string): Promise<boolean>;
  /** RSVP — přidá/odebere userId v `attendeeUserIds`. Vrací updated nebo null. */
  setAttendee(
    id: string,
    userId: string,
    attending: boolean,
  ): Promise<IkarosEventItem | null>;
}
