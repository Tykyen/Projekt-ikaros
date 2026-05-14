import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoSecurityTokensRepository } from './security-tokens.repository';
import { SecurityTokenSchemaClass } from '../schemas/security-token.schema';

describe('MongoSecurityTokensRepository', () => {
  let repo: MongoSecurityTokensRepository;
  const mockModel = {
    create: jest.fn(),
    findOne: jest.fn(() => ({ lean: () => ({ exec: jest.fn() }) })),
    findOneAndUpdate: jest.fn(() => ({ exec: jest.fn() })),
    updateMany: jest.fn(() => ({ exec: jest.fn() })),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoSecurityTokensRepository,
        {
          provide: getModelToken(SecurityTokenSchemaClass.name),
          useValue: mockModel,
        },
      ],
    }).compile();
    repo = module.get(MongoSecurityTokensRepository);
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('vytvoří záznam a vrátí entity', async () => {
      const expiresAt = new Date('2026-12-31');
      const createdAt = new Date();
      mockModel.create.mockResolvedValue({
        _id: 'doc1',
        tokenHash: 'h1',
        userId: 'u1',
        type: 'password_reset',
        expiresAt,
        createdAt,
      });
      const result = await repo.save({
        tokenHash: 'h1',
        userId: 'u1',
        type: 'password_reset',
        expiresAt,
      });
      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: 'h1',
          userId: 'u1',
          type: 'password_reset',
        }),
      );
      expect(result.id).toBe('doc1');
      expect(result.tokenHash).toBe('h1');
    });

    it('propaguje meta', async () => {
      mockModel.create.mockResolvedValue({
        _id: 'doc1',
        tokenHash: 'h1',
        userId: 'u1',
        type: 'email_change',
        meta: { newEmail: 'x@y.cz' },
        expiresAt: new Date(),
        createdAt: new Date(),
      });
      const result = await repo.save({
        tokenHash: 'h1',
        userId: 'u1',
        type: 'email_change',
        meta: { newEmail: 'x@y.cz' },
        expiresAt: new Date(),
      });
      expect(result.meta).toEqual({ newEmail: 'x@y.cz' });
    });
  });

  describe('findByHash', () => {
    it('vrátí null pokud neexistuje', async () => {
      mockModel.findOne.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
      });
      const result = await repo.findByHash('missing');
      expect(result).toBeNull();
    });

    it('vrátí entity pokud existuje', async () => {
      mockModel.findOne.mockReturnValue({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({
            _id: 'doc1',
            tokenHash: 'h1',
            userId: 'u1',
            type: 'password_reset',
            expiresAt: new Date(),
            createdAt: new Date(),
          }),
        }),
      });
      const result = await repo.findByHash('h1');
      expect(result?.id).toBe('doc1');
      expect(result?.userId).toBe('u1');
    });
  });

  describe('markUsed', () => {
    it('volá findOneAndUpdate s _id + usedAt $exists guard', async () => {
      mockModel.findOneAndUpdate.mockReturnValue({ exec: jest.fn() });
      const now = new Date();
      await repo.markUsed('doc1', now);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'doc1', usedAt: { $exists: false } },
        { usedAt: now },
      );
    });
  });

  describe('invalidateAllByUserAndType', () => {
    it('updateMany s userId + type + usedAt missing filter', async () => {
      mockModel.updateMany.mockReturnValue({ exec: jest.fn() });
      await repo.invalidateAllByUserAndType('u1', 'password_reset');
      expect(mockModel.updateMany).toHaveBeenCalledWith(
        { userId: 'u1', type: 'password_reset', usedAt: { $exists: false } },
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
    });
  });
});
