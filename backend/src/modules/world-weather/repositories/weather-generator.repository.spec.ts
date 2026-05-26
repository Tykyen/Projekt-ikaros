// backend/src/modules/world-weather/repositories/weather-generator.repository.spec.ts

import { MongoWeatherGeneratorRepository } from './weather-generator.repository';

const VALID_ID = '507f1f77bcf86cd799439011';

const mockModel = {
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
  bulkWrite: jest.fn(),
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
    // 9.4-I — findByWorldId nyní chainí .sort() před .lean().exec()
    mockModel.find.mockReturnValue({
      sort: () => ({
        lean: () => ({
          exec: () =>
            Promise.resolve([
              {
                _id: 'id1',
                worldId: 'w1',
                name: 'Test',
                config: {},
                displayOrder: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]),
        }),
      }),
    });
    const result = await repo.findByWorldId('w1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id1');
    expect(result[0].worldId).toBe('w1');
    expect(result[0].displayOrder).toBe(0);
  });

  it('reorder calls bulkWrite with updateOne ops', async () => {
    mockModel.bulkWrite.mockResolvedValue({ modifiedCount: 2 });
    await repo.reorder('w1', [VALID_ID, '507f1f77bcf86cd799439012']);
    expect(mockModel.bulkWrite).toHaveBeenCalledTimes(1);
    const ops = mockModel.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.update.$set.displayOrder).toBe(0);
    expect(ops[1].updateOne.update.$set.displayOrder).toBe(1);
  });

  it('reorder s prázdným polem nedělá nic', async () => {
    await repo.reorder('w1', []);
    expect(mockModel.bulkWrite).not.toHaveBeenCalled();
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
