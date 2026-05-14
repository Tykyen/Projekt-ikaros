import mongoose from 'mongoose';

export interface MappedRow {
  _id: string;
  doc: Record<string, unknown>;
}

/**
 * Postaví bulkWrite operaci pro jednu mapovanou položku.
 * `filter: { _id }` + `upsert: true` zajišťuje idempotenci — opakované spuštění
 * stejného JSONu provede `replaceOne` na stejné _id (nikdy nevytvoří duplicitu).
 */
export function buildBulkWriteOp(item: MappedRow) {
  const objectId = new mongoose.Types.ObjectId(item._id);
  return {
    replaceOne: {
      filter: { _id: objectId },
      replacement: { ...item.doc, _id: objectId },
      upsert: true,
    },
  };
}
