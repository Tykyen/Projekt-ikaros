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
  };

  it('findPublished volá find se status Published', async () => {
    const repo = new MongoIkarosGalleryRepository(mockModel as never);
    await repo.findPublished();
    expect(mockModel.find).toHaveBeenCalledWith({ status: 'Published' });
  });
});
