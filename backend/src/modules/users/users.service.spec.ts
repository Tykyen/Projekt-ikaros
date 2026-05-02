import { Test } from '@nestjs/testing';
import {
  NotFoundException, ConflictException, UnauthorizedException,
} from '@nestjs/common';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserRole } from './interfaces/user.interface';

const mockUser = {
  id: '1', email: 'a@a.com', username: 'user',
  passwordHash: 'hashedpass', role: UserRole.Hrac,
  displayName: undefined, avatarUrl: undefined,
  characterPath: undefined, ikarosSkin: undefined,
  akj: false, themeSettings: { theme: 'light', fontSize: 14 }, chatPreferences: {},
  isOnline: false, lastSeenAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;
  const mockRepo = {
    findById: jest.fn(),
    findByUsername: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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

  // --- findById ---
  it('findById: throws NotFoundException for unknown user', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
  });

  it('findById: returns user without passwordHash', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    const result = await service.findById('1');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toHaveProperty('akj', false);
    expect(result).toHaveProperty('themeSettings');
  });

  // --- publicProfile ---
  it('publicProfile: throws NotFoundException for unknown user', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.publicProfile('unknown')).rejects.toThrow(NotFoundException);
  });

  it('publicProfile: returns only public fields', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    const result = await service.publicProfile('1');
    expect(result).toHaveProperty('username', 'user');
    expect(result).toHaveProperty('role');
    expect(result).toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('themeSettings');
    expect(result).not.toHaveProperty('chatPreferences');
    expect(result).not.toHaveProperty('akj');
  });

  // --- update merge logika ---
  it('update: deep-merges themeSettings (přidá nový klíč, zachová starý)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({ ...mockUser, themeSettings: { theme: 'light', fontSize: 14, accentColor: 'red' } });
    await service.update('1', { themeSettings: { accentColor: 'red' } });
    expect(mockRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({
      themeSettings: { theme: 'light', fontSize: 14, accentColor: 'red' },
    }));
  });

  it('update: deep-merge přepíše existující klíč, zachová ostatní', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({ ...mockUser, themeSettings: { theme: 'dark', fontSize: 14 } });
    await service.update('1', { themeSettings: { theme: 'dark' } });
    expect(mockRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({
      themeSettings: { theme: 'dark', fontSize: 14 },
    }));
  });

  it('update: undefined themeSettings nezpůsobí přepsání (zachová stávající)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.update('1', { displayName: 'Elara' });
    const callArg = mockRepo.update.mock.calls[0][1];
    expect(callArg).not.toHaveProperty('themeSettings');
  });

  it('update: username conflict → ConflictException', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue({ ...mockUser, id: '999' });
    await expect(service.update('1', { username: 'taken' })).rejects.toThrow(ConflictException);
  });

  it('update: username change na vlastní username → OK (žádný conflict)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(mockUser);
    mockRepo.update.mockResolvedValue(mockUser);
    await expect(service.update('1', { username: 'user' })).resolves.not.toThrow();
  });

  // --- changePassword ---
  it('changePassword: správné staré heslo → uloží nový hash', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash' as never).mockResolvedValue('newhash' as never);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.changePassword('1', { oldPassword: 'old', newPassword: 'newpass123' });
    expect(mockRepo.update).toHaveBeenCalledWith('1', { passwordHash: 'newhash' });
  });

  it('changePassword: špatné staré heslo → UnauthorizedException', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(false as never);
    await expect(
      service.changePassword('1', { oldPassword: 'wrong', newPassword: 'newpass123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('changePassword: neznámý user → NotFoundException', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      service.changePassword('x', { oldPassword: 'old', newPassword: 'newpass123' }),
    ).rejects.toThrow(NotFoundException);
  });

  // --- resetPassword ---
  it('resetPassword: uloží nový hash bez ověření starého hesla', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'hash' as never).mockResolvedValue('resethash' as never);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.resetPassword('1', { newPassword: 'newpass123' });
    expect(mockRepo.update).toHaveBeenCalledWith('1', { passwordHash: 'resethash' });
  });

  it('resetPassword: neznámý user → NotFoundException', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      service.resetPassword('x', { newPassword: 'newpass123' }),
    ).rejects.toThrow(NotFoundException);
  });

  // --- delete ---
  it('delete: zavolá repo.delete s userId', async () => {
    mockRepo.delete.mockResolvedValue(true);
    await service.delete('1');
    expect(mockRepo.delete).toHaveBeenCalledWith('1');
  });

  it('delete: neznámý user → NotFoundException', async () => {
    mockRepo.delete.mockResolvedValue(false);
    await expect(service.delete('x')).rejects.toThrow(NotFoundException);
  });
});
