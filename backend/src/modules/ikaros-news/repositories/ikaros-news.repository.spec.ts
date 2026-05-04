import { MongoIkarosNewsRepository } from './ikaros-news.repository';

describe('MongoIkarosNewsRepository.findActive', () => {
  it('dotazuje se jen na isActive=true, řazeno createdAtUtc DESC', async () => {
    const mockModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    const repo = new MongoIkarosNewsRepository(mockModel as never);
    await repo.findActive();
    expect(mockModel.find).toHaveBeenCalledWith({ isActive: true });
  });
});
