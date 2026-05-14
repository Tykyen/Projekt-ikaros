import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoRefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenSchemaClass } from '../schemas/refresh-token.schema';

describe('MongoRefreshTokenRepository', () => {
  let repo: MongoRefreshTokenRepository;
  const mockModel = {
    create: jest.fn(),
    findOne: jest.fn(() => ({ lean: () => ({ exec: jest.fn() }) })),
    findOneAndUpdate: jest.fn(() => ({ exec: jest.fn() })),
    updateMany: jest.fn(() => ({ exec: jest.fn() })),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoRefreshTokenRepository,
        {
          provide: getModelToken(RefreshTokenSchemaClass.name),
          useValue: mockModel,
        },
      ],
    }).compile();
    repo = module.get(MongoRefreshTokenRepository);
    jest.clearAllMocks();
  });

  it('save vytvoří záznam', async () => {
    const expiresAt = new Date();
    mockModel.create.mockResolvedValue({
      _id: 'doc1',
      jti: 'j1',
      userId: 'u1',
      familyId: 'f1',
      expiresAt,
      revoked: false,
      createdAt: new Date(),
    });
    const result = await repo.save({
      jti: 'j1',
      userId: 'u1',
      familyId: 'f1',
      expiresAt,
      revoked: false,
    });
    expect(mockModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ jti: 'j1', userId: 'u1', familyId: 'f1' }),
    );
    expect(result.jti).toBe('j1');
  });

  it('findByJti vrátí null pokud neexistuje', async () => {
    mockModel.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });
    const result = await repo.findByJti('missing');
    expect(result).toBeNull();
  });

  it('findByJti vrátí entity pro existující záznam', async () => {
    const doc = {
      _id: 'd',
      jti: 'j1',
      userId: 'u1',
      familyId: 'f1',
      expiresAt: new Date(),
      revoked: false,
      createdAt: new Date(),
    };
    mockModel.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(doc) }),
    });
    const result = await repo.findByJti('j1');
    expect(result?.jti).toBe('j1');
    expect(result?.revoked).toBe(false);
  });

  it('revokeByJti volá findOneAndUpdate s revoked=true', async () => {
    mockModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({}),
    });
    await repo.revokeByJti('j1');
    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { jti: 'j1' },
      { revoked: true },
    );
  });

  it('revokeFamily volá updateMany na všechny tokeny familyId', async () => {
    mockModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
    });
    await repo.revokeFamily('f1');
    expect(mockModel.updateMany).toHaveBeenCalledWith(
      { familyId: 'f1' },
      { revoked: true },
    );
  });

  it('revokeAllForUser volá updateMany na všechny tokeny userId', async () => {
    mockModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 5 }),
    });
    await repo.revokeAllForUser('u1');
    expect(mockModel.updateMany).toHaveBeenCalledWith(
      { userId: 'u1' },
      { revoked: true },
    );
  });
});
