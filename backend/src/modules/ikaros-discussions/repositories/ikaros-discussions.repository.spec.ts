import { MongoIkarosDiscussionsRepository } from './ikaros-discussions.repository';

describe('MongoIkarosDiscussionsRepository', () => {
  const mockModel = {
    find: jest.fn().mockReturnValue({
      lean: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
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
  };

  it('findPending volá find s isApproved false', async () => {
    const repo = new MongoIkarosDiscussionsRepository(mockModel as never);
    await repo.findPending();
    expect(mockModel.find).toHaveBeenCalledWith({ isApproved: false });
  });

  // D-DROBNE — GET /my: filtr výhradně dle creatorId + sort s `_id` tiebreakem.
  it('findByCreator filtruje dle creatorId a řadí createdAtUtc desc s _id tiebreakem', async () => {
    const sortMock = jest.fn().mockReturnValue({
      lean: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    });
    const model = {
      ...mockModel,
      find: jest.fn().mockReturnValue({ sort: sortMock }),
    };
    const repo = new MongoIkarosDiscussionsRepository(model as never);
    await repo.findByCreator('user1');
    expect(model.find).toHaveBeenCalledWith({ creatorId: 'user1' });
    expect(sortMock).toHaveBeenCalledWith({ createdAtUtc: -1, _id: -1 });
  });
});
