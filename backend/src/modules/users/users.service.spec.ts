import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRole } from './interfaces/user.interface';

const mockUser = {
  id: '1', email: 'a@a.com', username: 'user',
  passwordHash: 'x', role: UserRole.Hrac,
  isOnline: false, lastSeenAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;
  const mockRepo = {
    findById: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: 'IUsersRepository', useValue: mockRepo },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  it('should throw NotFoundException for unknown user', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
  });

  it('should return user without passwordHash', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    const result = await service.findById('1');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.id).toBe('1');
  });
});
