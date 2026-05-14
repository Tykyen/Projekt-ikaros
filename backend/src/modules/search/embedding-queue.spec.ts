import { EmbeddingQueue, QueueOperation } from './embedding-queue';

describe('EmbeddingQueue', () => {
  it('enqueue — spustí handler pro Upsert', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const queue = new EmbeddingQueue(handler);
    queue.start();

    queue.enqueue({ type: 'Upsert', page: { id: 'p1' } as any });
    await new Promise((r) => setTimeout(r, 50));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Upsert' }),
    );
    queue.stop();
  });

  it('enqueue — Upsert během Rebuild jde do backlogu', async () => {
    let rebuildResolve!: () => void;
    const rebuildPromise = new Promise<void>((r) => {
      rebuildResolve = r;
    });

    const handler = jest.fn().mockImplementation((op: QueueOperation) => {
      if (op.type === 'Rebuild') return rebuildPromise;
      return Promise.resolve();
    });

    const queue = new EmbeddingQueue(handler);
    queue.start();

    queue.enqueue({ type: 'Rebuild' });
    await new Promise((r) => setTimeout(r, 10));
    queue.enqueue({ type: 'Upsert', page: { id: 'p2' } as any });
    await new Promise((r) => setTimeout(r, 10));

    // Během rebuildu handler dostal jen Rebuild
    expect(handler).toHaveBeenCalledTimes(1);

    rebuildResolve();
    await new Promise((r) => setTimeout(r, 50));

    // Po rebuildu se zpracoval backlog Upsert
    expect(handler).toHaveBeenCalledTimes(2);
    queue.stop();
  });
});
