import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoAdminAuditLogRepository } from './admin-audit-log.repository';
import { AdminAuditLogSchemaClass } from '../schemas/admin-audit-log.schema';

describe('MongoAdminAuditLogRepository', () => {
  let repo: MongoAdminAuditLogRepository;
  const mockModel = {
    create: jest.fn(),
    find: jest.fn(() => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: () => ({ exec: jest.fn().mockResolvedValue([]) }),
          }),
        }),
      }),
    })),
    countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) })),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoAdminAuditLogRepository,
        {
          provide: getModelToken(AdminAuditLogSchemaClass.name),
          useValue: mockModel,
        },
      ],
    }).compile();
    repo = module.get(MongoAdminAuditLogRepository);
    jest.clearAllMocks();
  });

  it('record creates doc', async () => {
    mockModel.create.mockResolvedValue({});
    await repo.record({
      actorId: 'a',
      actorUsername: 'admin',
      targetId: 't',
      targetUsername: 'target',
      action: 'BAN',
      before: null,
      after: { bannedAt: new Date() },
      reason: 'spam',
    });
    expect(mockModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'a', action: 'BAN' }),
    );
  });

  it('listPaginated bez filtru → find({})', async () => {
    await repo.listPaginated({ page: 1, limit: 20 });
    expect(mockModel.find).toHaveBeenCalledWith({});
  });

  it('listPaginated s action filter', async () => {
    await repo.listPaginated({ action: 'BAN', page: 1, limit: 20 });
    expect(mockModel.find).toHaveBeenCalledWith({ action: 'BAN' });
  });

  it('listPaginated s actorId + targetId', async () => {
    await repo.listPaginated({
      actorId: 'a',
      targetId: 't',
      page: 1,
      limit: 20,
    });
    expect(mockModel.find).toHaveBeenCalledWith({
      actorId: 'a',
      targetId: 't',
    });
  });
});
