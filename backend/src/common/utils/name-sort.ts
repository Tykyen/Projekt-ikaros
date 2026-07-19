/**
 * D-NAMESORT — denormalizovaný řadicí klíč pro české názvy v katalozích.
 *
 * PROČ: Mongo řadí stringy binárně (byte-order), takže diakritika (UTF-8
 * vícebyte) padá až ZA ASCII — „Čáp" se seřadí až za „Zebrou". Katalogy nad
 * sebou nemají FE re-sort, binární pořadí z DB je finální → řešíme denormalizací.
 *
 * ŘEŠENÍ: lowercase + ASCII-fold klíč (NFD → strip diakritiky → lowercase),
 * uložený vedle zdroje a indexovaný jako běžný string index. „Čáp" → „cap"
 * spadne do C-skupiny. NENÍ to plné ČSN řazení (č až za všemi c, „ch" jako
 * digraf) — záměrný kompromis: běžný index jde použít i pro string filtr,
 * kdežto Mongo `cs` collation by shodila `{status,kind}` z plánu (COLLSCAN).
 */
import type { Document, Query, Schema } from 'mongoose';

/**
 * Sfolduje text na řadicí klíč: NFD normalizace → odstranění diakritiky →
 * lowercase → sjednocení whitespace → trim. Ne-string → prázdný klíč.
 * Stejný fold jako `worlds.service.slugifyName`, ale bez slug-munging
 * (zachovává mezery, aby víceslovné názvy řadily přirozeně).
 */
export function foldSortKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mongoose plugin: udržuje `targetField` = foldSortKey(`sourceField`) při všech
 * zápisových cestách. Pole `targetField` deklaruj v schématu (`@Prop`), plugin
 * jen navěsí derivaci — nikdy se nenastavuje ručně.
 *
 * Pokryté cesty: `model.create()` / `doc.save()`, `findOneAndUpdate` /
 * `updateOne` / `updateMany` (vč. `findByIdAndUpdate`) a `insertMany` (seedy).
 */
export function sortKeyPlugin(
  schema: Schema,
  sourceField: string,
  targetField: string,
): void {
  // POZOR: Mongoose 9 (Kareem 3) NEPŘEDÁVÁ do pre-hooků callback `next` —
  // hook buď vrátí Promise, nebo nic (Kareem si návrat poawaituje). Starý
  // `function (next) { …; next(); }` hodí za běhu `TypeError: next is not a
  // function` (500 na každém save/update). `tsc` to neodhalí (parametr je jen
  // typovaný, nepředá se). Proto VŠECHNY hooky bez `next` — viz i insertMany níž.

  // create() / doc.save() — přepočítej vždy (levné, drží konzistenci).
  schema.pre('save', function (this: Document): void {
    const doc = this as unknown as Record<string, unknown>;
    doc[targetField] = foldSortKey(doc[sourceField]);
  });

  // findByIdAndUpdate / findOneAndUpdate / updateOne / updateMany —
  // deriv jen když update mění zdrojové pole (v `$set` nebo top-level).
  function applyToUpdate(this: Query<unknown, unknown>): void {
    const update = this.getUpdate() as Record<string, unknown> | null;
    if (!update) return;
    const set = update.$set as Record<string, unknown> | undefined;
    if (set && Object.prototype.hasOwnProperty.call(set, sourceField)) {
      set[targetField] = foldSortKey(set[sourceField]);
    } else if (Object.prototype.hasOwnProperty.call(update, sourceField)) {
      update[targetField] = foldSortKey(update[sourceField]);
    }
  }
  schema.pre('findOneAndUpdate', applyToUpdate);
  schema.pre('updateOne', applyToUpdate);
  schema.pre('updateMany', applyToUpdate);

  // insertMany — save hook zde NEfires (seed skripty). Mongoose 9 předává
  // rovnou (docs, options), žádný `next`.
  schema.pre(
    'insertMany',
    function (docs: Record<string, unknown> | Record<string, unknown>[]): void {
      const list = Array.isArray(docs) ? docs : [docs];
      for (const doc of list) doc[targetField] = foldSortKey(doc[sourceField]);
    },
  );
}
