import { MongoIkarosGalleryRepository } from './ikaros-gallery.repository';

describe('MongoIkarosGalleryRepository', () => {
  const mockModel = {
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      }),
    }),
    findById: jest.fn().mockReturnValue({
      lean: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    }),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn().mockReturnValue({
      lean: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    }),
    findByIdAndDelete: jest.fn().mockReturnValue({
      lean: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    }),
    aggregate: jest.fn().mockResolvedValue([]),
    countDocuments: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
  };

  it('findPublished volá find se status Published (+ B4b: bez moderačně skrytých)', async () => {
    const repo = new MongoIkarosGalleryRepository(mockModel as never);
    await repo.findPublished();
    expect(mockModel.find).toHaveBeenCalledWith({
      status: 'Published',
      moderationHidden: { $ne: true },
    });
  });

  it('countByCategory volá countDocuments s kategorií', async () => {
    const repo = new MongoIkarosGalleryRepository(mockModel as never);
    await repo.countByCategory('fanart');
    expect(mockModel.countDocuments).toHaveBeenCalledWith({
      category: 'fanart',
    });
  });

  // D-071 — nevalidní ObjectId nesmí spadnout na CastError (500).
  it('findById s nevalidním ObjectId vrátí null bez dotazu do DB', async () => {
    const repo = new MongoIkarosGalleryRepository(mockModel as never);
    mockModel.findById.mockClear();
    const result = await repo.findById('notanobjectid');
    expect(result).toBeNull();
    expect(mockModel.findById).not.toHaveBeenCalled();
  });

  it('findById s validním ObjectId dotaz do DB provede', async () => {
    const repo = new MongoIkarosGalleryRepository(mockModel as never);
    mockModel.findById.mockClear();
    await repo.findById('507f1f77bcf86cd799439011');
    expect(mockModel.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });
});
