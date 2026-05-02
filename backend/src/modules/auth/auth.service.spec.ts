import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '../users/interfaces/user.interface';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

const mockUser = {
  id: '1', email: 'a@a.com', username: 'user',
  passwordHash: 'hash', role: UserRole.Hrac,
  displayName: undefined, avatarUrl: undefined,
  characterPath: 'elara', ikarosSkin: 'default',
  akj: true,
  themeSettings: {}, chatPreferences: {},
  isOnline: false, lastSeenAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  const mockRepo = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    save: jest.fn(),
    updateLastSeen: jest.fn(),
  };
  const mockJwt = { sign: jest.fn().mockReturnValue('token') };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'IUsersRepository', useValue: mockRepo },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('login token payload should include akj claim', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockRepo.findByEmail.mockResolvedValue(mockUser);
    mockRepo.updateLastSeen.mockResolvedValue(undefined);

    await service.login({ email: 'a@a.com', password: 'pass' });

    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ akj: true }),
    );
  });

  it('login token payload should include akj: false when user has akj false', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockRepo.findByEmail.mockResolvedValue({ ...mockUser, akj: false });
    mockRepo.updateLastSeen.mockResolvedValue(undefined);

    await service.login({ email: 'a@a.com', password: 'pass' });

    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ akj: false }),
    );
  });

  it('register should throw ConflictException for duplicate email', async () => {
    mockRepo.findByEmail.mockResolvedValue(mockUser);
    await expect(
      service.register({ email: 'a@a.com', username: 'new', password: 'pass123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('login should throw UnauthorizedException for wrong password', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    mockRepo.findByEmail.mockResolvedValue(mockUser);
    await expect(
      service.login({ email: 'a@a.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
