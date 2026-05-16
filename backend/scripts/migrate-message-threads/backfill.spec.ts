import mongoose from 'mongoose';
import { buildBackfillOp, MISSING_CONVERSATION_FILTER } from './backfill';

describe('buildBackfillOp', () => {
  const oid = '507f1f77bcf86cd799439011';

  it('filter._id je ObjectId odpovídající vstupu', () => {
    const op = buildBackfillOp(oid);
    expect(op.updateOne.filter._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(op.updateOne.filter._id.toHexString()).toBe(oid);
  });

  it('nastaví conversationId = _id (hex string)', () => {
    const op = buildBackfillOp(oid);
    expect(op.updateOne.update.$set.conversationId).toBe(oid);
  });

  it('idempotence — 2× volání produkuje totožný op', () => {
    const a = buildBackfillOp(oid);
    const b = buildBackfillOp(oid);
    expect(a.updateOne.update.$set.conversationId).toBe(
      b.updateOne.update.$set.conversationId,
    );
  });

  it('vyhodí pro nevalidní ObjectId', () => {
    expect(() => buildBackfillOp('not-an-oid')).toThrow();
  });

  it('filter pokrývá chybějící / prázdné / null conversationId', () => {
    expect(MISSING_CONVERSATION_FILTER.$or).toHaveLength(3);
  });
});
