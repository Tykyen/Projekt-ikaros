import { MongoIkarosDiscussionsRepository } from './ikaros-discussions.repository';

describe('MongoIkarosDiscussionsRepository', () => {
  const mockModel = {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) }),
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) }),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) }),
    findByIdAndDelete: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) }),
  };

  it('findPending volá find s isApproved false', async () => {
    const repo = new MongoIkarosDiscussionsRepository(mockModel as never);
    await repo.findPending();
    expect(mockModel.find).toHaveBeenCalledWith({ isApproved: false });
  });
});
