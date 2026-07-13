import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoMailDailyCounterRepository } from './mail-daily-counter.repository';
import { MailDailyCounterSchemaClass } from '../schemas/mail-daily-counter.schema';

describe('MongoMailDailyCounterRepository', () => {
  let repo: MongoMailDailyCounterRepository;
  const mockModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoMailDailyCounterRepository,
        {
          provide: getModelToken(MailDailyCounterSchemaClass.name),
          useValue: mockModel,
        },
      ],
    }).compile();
    repo = module.get(MongoMailDailyCounterRepository);
    jest.clearAllMocks();
  });

  it('getSent → 0 když dokument dne neexistuje', async () => {
    mockModel.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });
    await expect(repo.getSent('2026-07-12')).resolves.toBe(0);
  });

  it('getSent → sent z dokumentu', async () => {
    mockModel.findOne.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({ day: '2026-07-12', sent: 42 }),
      }),
    });
    await expect(repo.getSent('2026-07-12')).resolves.toBe(42);
  });

  it('incrementSent → atomický $inc s upsertem, vrací nový počet', async () => {
    mockModel.findOneAndUpdate.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({ day: '2026-07-12', sent: 7 }),
      }),
    });
    await expect(repo.incrementSent('2026-07-12')).resolves.toBe(7);
    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { day: '2026-07-12' },
      { $inc: { sent: 1 } },
      { upsert: true, new: true },
    );
  });

  it('E11000 při souběžném upsertu → retry 1× projde', async () => {
    mockModel.findOneAndUpdate
      .mockReturnValueOnce({
        lean: () => ({
          exec: jest.fn().mockRejectedValue(new Error('E11000 duplicate key')),
        }),
      })
      .mockReturnValueOnce({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({ day: '2026-07-12', sent: 1 }),
        }),
      });
    await expect(repo.incrementSent('2026-07-12')).resolves.toBe(1);
    expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });
});
