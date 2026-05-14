import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PresenceService } from './presence.service';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

describe('PresenceService', () => {
  let service: PresenceService;
  let usersRepo: jest.Mocked<IUsersRepository>;

  beforeEach(async () => {
    usersRepo = {
      findOnlineSince: jest.fn(),
    } as unknown as jest.Mocked<IUsersRepository>;

    const module = await Test.createTestingModule({
      providers: [
        PresenceService,
        { provide: 'IUsersRepository', useValue: usersRepo },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(25) },
        },
      ],
    }).compile();

    service = module.get(PresenceService);
  });

  it('vrátí pole userIds od findOnlineSince', async () => {
    usersRepo.findOnlineSince.mockResolvedValue(['u1', 'u2']);
    const result = await service.getOnlineUserIds();
    expect(result).toEqual(['u1', 'u2']);
    expect(usersRepo.findOnlineSince).toHaveBeenCalledWith(expect.any(Date));
  });

  it('threshold je přibližně 25 hodin zpět', async () => {
    usersRepo.findOnlineSince.mockResolvedValue([]);
    const before = Date.now();
    await service.getOnlineUserIds();
    const call = usersRepo.findOnlineSince.mock.calls[0][0];
    const diffMs = before - call.getTime();
    expect(diffMs).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(26 * 60 * 60 * 1000);
  });
});
