import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { UserRole } from '../users/interfaces/user.interface';
import * as bcrypt from 'bcrypt';

const mockUser = {
  id: '1',
  email: 'test@test.com',
  username: 'testuser',
  passwordHash: '',
  role: UserRole.Hrac,
  isOnline: false,
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  const mockUsersRepository = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    save: jest.fn(),
    updateLastSeen: jest.fn(),
  };
  const mockJwtService = { sign: jest.fn().mockReturnValue('token') };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'IUsersRepository', useValue: mockUsersRepository },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('should throw ConflictException if email already exists', async () => {
    mockUsersRepository.findByEmail.mockResolvedValue(mockUser);
    await expect(
      service.register({ email: 'test@test.com', username: 'new', password: '123456' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw UnauthorizedException for wrong password', async () => {
    mockUsersRepository.findByEmail.mockResolvedValue({
      ...mockUser,
      passwordHash: '$2b$10$invalidhash',
    });
    await expect(
      service.login({ email: 'test@test.com', password: 'wrongpass' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should return accessToken on successful login', async () => {
    const hash = await bcrypt.hash('correctpass', 10);
    mockUsersRepository.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: hash });
    mockUsersRepository.updateLastSeen.mockResolvedValue(undefined);
    const result = await service.login({ email: 'test@test.com', password: 'correctpass' });
    expect(result.accessToken).toBe('token');
  });
});
