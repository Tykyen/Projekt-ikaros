// backend/src/modules/world-weather/repositories/weather-generator.repository.spec.ts

import { MongoWeatherGeneratorRepository } from './weather-generator.repository';

const VALID_ID = '507f1f77bcf86cd799439011';

const mockModel = {
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

function makeModel(mock: Record<string, jest.Mock>) {
  const inst = function (data: Record<string, unknown>) {
    return {
      ...data,
      save: jest.fn().mockResolvedValue({ _id: 'id1', ...data }),
    };
  };
  Object.assign(inst, mock);
  return inst;
}

describe('MongoWeatherGeneratorRepository', () => {
  let repo: MongoWeatherGeneratorRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new MongoWeatherGeneratorRepository(makeModel(mockModel) as never);
  });

  it('findByWorldId returns mapped generators', async () => {
    mockModel.find.mockReturnValue({
      lean: () => ({
        exec: () =>
          Promise.resolve([
            {
              _id: 'id1',
              worldId: 'w1',
              name: 'Test',
              config: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
      }),
    });
    const result = await repo.findByWorldId('w1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id1');
    expect(result[0].worldId).toBe('w1');
  });

  it('delete returns true when found', async () => {
    mockModel.findByIdAndDelete.mockReturnValue({
      exec: () => Promise.resolve({ _id: VALID_ID }),
    });
    const result = await repo.delete(VALID_ID);
    expect(result).toBe(true);
  });

  it('delete returns false when not found', async () => {
    mockModel.findByIdAndDelete.mockReturnValue({
      exec: () => Promise.resolve(null),
    });
    const result = await repo.delete(VALID_ID);
    expect(result).toBe(false);
  });
});
