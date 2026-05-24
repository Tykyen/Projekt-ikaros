import mongoose from 'mongoose';
import { buildBulkWriteOp } from './bulk-write';

describe('buildBulkWriteOp', () => {
  const validOid = '507f1f77bcf86cd799439011';

  it('vrátí replaceOne s filter._id jako ObjectId odpovídající input string', () => {
    const op = buildBulkWriteOp({
      _id: validOid,
      doc: { title: 'Test', content: 'X' },
    });

    expect(op.replaceOne.filter._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(op.replaceOne.filter._id.toHexString()).toBe(validOid);
  });

  it('vrátí upsert: true (idempotence — replaceOne+upsert nevytvoří duplicitu)', () => {
    const op = buildBulkWriteOp({ _id: validOid, doc: { title: 'A' } });
    expect(op.replaceOne.upsert).toBe(true);
  });

  it('replacement obsahuje doc fields + správné _id', () => {
    const op = buildBulkWriteOp({
      _id: validOid,
      doc: { title: 'Hello', content: 'World', type: 'info' },
    });

    expect(op.replaceOne.replacement).toMatchObject({
      title: 'Hello',
      content: 'World',
      type: 'info',
    });
    expect(op.replaceOne.replacement._id.toHexString()).toBe(validOid);
  });

  it('idempotence: 2× volání pro stejné _id produkuje totožné filter._id (stejný hex)', () => {
    const item = { _id: validOid, doc: { title: 'X' } };
    const a = buildBulkWriteOp(item);
    const b = buildBulkWriteOp(item);

    expect(a.replaceOne.filter._id.toHexString()).toBe(
      b.replaceOne.filter._id.toHexString(),
    );
    expect(a.replaceOne.upsert).toBe(b.replaceOne.upsert);
  });

  it('různé _id produkují různé filter._id', () => {
    const a = buildBulkWriteOp({
      _id: validOid,
      doc: { title: 'A' },
    });
    const b = buildBulkWriteOp({
      _id: '507f1f77bcf86cd799439012',
      doc: { title: 'B' },
    });

    expect(a.replaceOne.filter._id.toHexString()).not.toBe(
      b.replaceOne.filter._id.toHexString(),
    );
  });

  it('vyhodí pokud _id není validní ObjectId hex', () => {
    expect(() => buildBulkWriteOp({ _id: 'not-an-oid', doc: {} })).toThrow();
  });
});
