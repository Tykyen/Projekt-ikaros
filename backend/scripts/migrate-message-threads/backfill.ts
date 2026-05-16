import mongoose from 'mongoose';

/**
 * 3.5 — backfill `conversationId` pro staré zprávy.
 * Každá zpráva bez vlákna se stává kořenem vlastního vlákna
 * (`conversationId = _id`). Idempotentní — re-run nenajde nic k migraci.
 */
export interface BackfillOp {
  updateOne: {
    filter: { _id: mongoose.Types.ObjectId };
    update: { $set: { conversationId: string } };
  };
}

/** Filtr zpráv, kterým chybí conversationId (bez pole / prázdné / null). */
export const MISSING_CONVERSATION_FILTER = {
  $or: [
    { conversationId: { $exists: false } },
    { conversationId: '' },
    { conversationId: null },
  ],
};

/** Pure — sestaví bulkWrite updateOne op: conversationId = _id (string). */
export function buildBackfillOp(id: string): BackfillOp {
  const oid = new mongoose.Types.ObjectId(id);
  return {
    updateOne: {
      filter: { _id: oid },
      update: { $set: { conversationId: oid.toHexString() } },
    },
  };
}
