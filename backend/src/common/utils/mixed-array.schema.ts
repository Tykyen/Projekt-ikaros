import { Schema } from 'mongoose';

/**
 * 2026-05-24 — Mongoose 9.6.x regrese v SchemaArray.cast() pro
 * `type: [Mixed]` / `[Object]` / `Array` props libovolného tvaru.
 * `Model.create()` padá při validaci s:
 *   `Cast to Array failed for value "[]" (type Array) at path "X"
 *    because of "TypeError"`
 *
 * Předchozí pokus o opravu (`type: [Schema.Types.Mixed]`) jen přejmenoval
 * hlášku (z `indexedPaths` na `Cast to Array`), crash zůstal.
 *
 * Workaround: pole sub-dokumentů se `strict:false` + bez `_id`. Mongoose
 * bere obsah jako sub-doc pole bez vlastní shape validace, takže libovolný
 * objekt projde a `_id` se v poli netvoří navíc (payload zůstává čistý).
 *
 * Použití:
 *   `@Prop({ type: [MixedArraySubSchema], default: () => [] })`
 *   `items: Record<string, unknown>[];`
 *
 * Pro nested 2D pole (`Record<string, unknown>[][]`) funguje:
 *   `@Prop({ type: [[MixedArraySubSchema]], default: () => [] })`
 *
 * Pozn.: jedna sdílená sub-schema instance napříč všemi modely je v pořádku
 * (sub-schema je idempotentní vůči parent modelu).
 */
export const MixedArraySubSchema = new Schema(
  {},
  { strict: false, _id: false },
);
