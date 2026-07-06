import { MongoIkarosEventRepository } from './ikaros-event.repository';

function execMock(value: unknown) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

const docFixture = {
  _id: 'e1',
  title: 'Akce',
  date: new Date('2026-06-01T18:00:00Z'),
  authorId: 'u1',
  createdAtUtc: new Date('2026-05-10T00:00:00Z'),
  confirmable: true,
  attendeeUserIds: [],
  isActive: true,
};

describe('MongoIkarosEventRepository', () => {
  describe('findActive', () => {
    it('filtruje isActive:true, řadí date vzestupně', async () => {
      const lean = jest.fn().mockReturnValue(execMock([]));
      const sort = jest.fn().mockReturnValue({ lean });
      const find = jest.fn().mockReturnValue({ sort });
      const repo = new MongoIkarosEventRepository({ find } as never);
      await repo.findActive();
      expect(find).toHaveBeenCalledWith({ isActive: true });
      expect(sort).toHaveBeenCalledWith({ date: 1 });
    });
  });

  describe('findUpcoming', () => {
    it('filtruje isActive + date >= now, aplikuje limit', async () => {
      const lean = jest.fn().mockReturnValue(execMock([]));
      const limit = jest.fn().mockReturnValue({ lean });
      const sort = jest.fn().mockReturnValue({ limit });
      const find = jest.fn().mockReturnValue({ sort });
      const repo = new MongoIkarosEventRepository({ find } as never);
      await repo.findUpcoming(10);
      const filter = find.mock.calls[0][0] as {
        isActive: boolean;
        date: { $gte: Date };
      };
      expect(filter.isActive).toBe(true);
      expect(filter.date.$gte).toBeInstanceOf(Date);
      expect(limit).toHaveBeenCalledWith(10);
    });
  });

  describe('update', () => {
    it('$set zadaných polí, vrací entitu', async () => {
      const lean = jest.fn().mockReturnValue(execMock(docFixture));
      const findByIdAndUpdate = jest.fn().mockReturnValue({ lean });
      const repo = new MongoIkarosEventRepository({
        findByIdAndUpdate,
      } as never);
      const res = await repo.update('e1', { title: 'Nová' });
      expect(findByIdAndUpdate).toHaveBeenCalledWith(
        'e1',
        { $set: { title: 'Nová' } },
        { new: true },
      );
      expect(res?.id).toBe('e1');
    });

    it('vrací null pro neexistující id', async () => {
      const lean = jest.fn().mockReturnValue(execMock(null));
      const findByIdAndUpdate = jest.fn().mockReturnValue({ lean });
      const repo = new MongoIkarosEventRepository({
        findByIdAndUpdate,
      } as never);
      await expect(repo.update('x', { title: 'Y' })).resolves.toBeNull();
    });

    // FIX-71 — `toEntity` dřív `imageFit` nemapovalo (uložilo se, ale při čtení
    // zpět zmizelo → feature mrtvá).
    it('mapuje imageFit z dokumentu (FIX-71)', async () => {
      const lean = jest
        .fn()
        .mockReturnValue(execMock({ ...docFixture, imageFit: 'contain' }));
      const findByIdAndUpdate = jest.fn().mockReturnValue({ lean });
      const repo = new MongoIkarosEventRepository({
        findByIdAndUpdate,
      } as never);
      const res = await repo.update('e1', { imageFit: 'contain' } as never);
      expect(res?.imageFit).toBe('contain');
    });
  });

  describe('delete (hard, CD-RUN-4b)', () => {
    it('volá findByIdAndDelete, vrací true pokud dokument existuje', async () => {
      const findByIdAndDelete = jest
        .fn()
        .mockReturnValue(execMock({ _id: 'e1' }));
      const repo = new MongoIkarosEventRepository({
        findByIdAndDelete,
      } as never);
      await expect(repo.delete('e1')).resolves.toBe(true);
      expect(findByIdAndDelete).toHaveBeenCalledWith('e1');
    });

    it('vrací false pokud dokument neexistuje', async () => {
      const findByIdAndDelete = jest.fn().mockReturnValue(execMock(null));
      const repo = new MongoIkarosEventRepository({
        findByIdAndDelete,
      } as never);
      await expect(repo.delete('x')).resolves.toBe(false);
    });
  });

  describe('setAttendee', () => {
    it('attending=true → $addToSet', async () => {
      const lean = jest
        .fn()
        .mockReturnValue(execMock({ ...docFixture, attendeeUserIds: ['u9'] }));
      const findByIdAndUpdate = jest.fn().mockReturnValue({ lean });
      const repo = new MongoIkarosEventRepository({
        findByIdAndUpdate,
      } as never);
      await repo.setAttendee('e1', 'u9', true);
      expect(findByIdAndUpdate).toHaveBeenCalledWith(
        'e1',
        { $addToSet: { attendeeUserIds: 'u9' } },
        { new: true },
      );
    });

    it('attending=false → $pull', async () => {
      const lean = jest.fn().mockReturnValue(execMock(docFixture));
      const findByIdAndUpdate = jest.fn().mockReturnValue({ lean });
      const repo = new MongoIkarosEventRepository({
        findByIdAndUpdate,
      } as never);
      await repo.setAttendee('e1', 'u9', false);
      expect(findByIdAndUpdate).toHaveBeenCalledWith(
        'e1',
        { $pull: { attendeeUserIds: 'u9' } },
        { new: true },
      );
    });
  });
});
