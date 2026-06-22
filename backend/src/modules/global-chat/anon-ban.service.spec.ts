import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnonBanService } from './anon-ban.service';
import { AnonBanSchemaClass } from './schemas/anon-ban.schema';

describe('AnonBanService', () => {
  let service: AnonBanService;
  let model: {
    findOne: jest.Mock;
    updateOne: jest.Mock;
    deleteOne: jest.Mock;
  };

  beforeEach(async () => {
    model = {
      findOne: jest.fn(),
      updateOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      deleteOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnonBanService,
        { provide: getModelToken(AnonBanSchemaClass.name), useValue: model },
      ],
    }).compile();
    service = moduleRef.get(AnonBanService);
  });

  it('isBanned vrací false, když záznam není', async () => {
    model.findOne.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    });
    expect(await service.isBanned('anon_x')).toBe(false);
  });

  it('isBanned vrací true, když záznam existuje', async () => {
    model.findOne.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve({ anonId: 'anon_x' }) }),
    });
    expect(await service.isBanned('anon_x')).toBe(true);
  });

  it('ban upsertuje anonId + bannedBy (idempotent)', async () => {
    await service.ban('anon_x', 'admin1');
    expect(model.updateOne).toHaveBeenCalledWith(
      { anonId: 'anon_x' },
      { $setOnInsert: { anonId: 'anon_x', bannedBy: 'admin1' } },
      { upsert: true },
    );
  });

  it('unban smaže záznam dle anonId', async () => {
    await service.unban('anon_x');
    expect(model.deleteOne).toHaveBeenCalledWith({ anonId: 'anon_x' });
  });
});
