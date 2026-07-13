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

  // D-19.2 — toEntity whitelist: `bytes` (velikost blobu) musí projít
  // read-mapperem, jinak by se uložená hodnota při GET ztratila
  // (be_field_check: schema/DTO/service/toEntity).
  describe('toEntity — bytes (D-19.2)', () => {
    const galleryDoc = (over: Record<string, unknown> = {}) => ({
      _id: '507f1f77bcf86cd799439011',
      title: 'Obrázek',
      imageUrl: 'https://cdn/g.jpg',
      publicId: 'gallery/g',
      width: 800,
      height: 600,
      category: 'fanart',
      authorId: 'u1',
      authorName: 'Autor',
      status: 'Draft',
      ratings: [],
      averageRating: 0,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
      ...over,
    });

    const repoWithDoc = (d: Record<string, unknown>) => {
      const model = {
        findById: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockReturnValue({ exec: jest.fn().mockResolvedValue(d) }),
        }),
      };
      return new MongoIkarosGalleryRepository(model as never);
    };

    it('bytes projde toEntity', async () => {
      const repo = repoWithDoc(galleryDoc({ bytes: 45_678 }));
      const item = await repo.findById('507f1f77bcf86cd799439011');
      expect(item?.bytes).toBe(45_678);
    });

    it('starý dokument bez bytes → undefined (žádný default)', async () => {
      const repo = repoWithDoc(galleryDoc());
      const item = await repo.findById('507f1f77bcf86cd799439011');
      expect(item?.bytes).toBeUndefined();
    });
  });
});
