import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IkarosEventsService } from './ikaros-events.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { IkarosEventItem } from './interfaces/ikaros-event.interface';

const mockItem: IkarosEventItem = {
  id: 'e1',
  title: 'Akce',
  date: new Date('2026-06-01T18:00:00Z'),
  description: 'Popis akce',
  confirmable: true,
  attendeeUserIds: [],
  authorId: 'user1',
  createdAtUtc: new Date('2026-05-10T00:00:00Z'),
  isActive: true,
};

describe('IkarosEventsService', () => {
  let service: IkarosEventsService;
  const mockRepo = {
    findActive: jest.fn(),
    findUpcoming: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setAttendee: jest.fn(),
  };
  const mockUsersRepo = { findById: jest.fn() };
  const mockEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUsersRepo.findById.mockResolvedValue({
      id: 'user1',
      username: 'AdminUser',
    });
    const module = await Test.createTestingModule({
      providers: [
        IkarosEventsService,
        { provide: 'IIkarosEventRepository', useValue: mockRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        // C-47 — service emituje 'ikaros-events.changed' po mutaci.
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();
    service = module.get(IkarosEventsService);
  });

  describe('findAll', () => {
    it('vrátí akce s authorName, confirmedCount a myRsvp', async () => {
      mockRepo.findActive.mockResolvedValue([
        { ...mockItem, attendeeUserIds: ['user1'] },
      ]);
      const result = await service.findAll('user1');
      expect(result[0]).toMatchObject({
        id: 'e1',
        authorName: 'AdminUser',
        confirmedCount: 1,
        myRsvp: 'confirmed',
      });
    });

    it('myRsvp = none pokud request user není mezi účastníky', async () => {
      mockRepo.findActive.mockResolvedValue([mockItem]);
      const result = await service.findAll('nekdoJiny');
      expect(result[0].myRsvp).toBe('none');
    });

    it('confirmedBy obsahuje joinnutá jména účastníků', async () => {
      mockRepo.findActive.mockResolvedValue([
        { ...mockItem, attendeeUserIds: ['user1'] },
      ]);
      const result = await service.findAll('user1');
      expect(result[0].confirmedBy).toEqual([
        { userId: 'user1', userName: 'AdminUser' },
      ]);
    });

    it('imageUrl/focal default na null pokud chybí', async () => {
      mockRepo.findActive.mockResolvedValue([mockItem]);
      const result = await service.findAll('user1');
      expect(result[0].imageUrl).toBeNull();
      expect(result[0].imageFocalX).toBeNull();
      expect(result[0].imageFocalY).toBeNull();
    });
  });

  describe('findUpcoming', () => {
    it('propaguje limit do repo', async () => {
      mockRepo.findUpcoming.mockResolvedValue([]);
      await service.findUpcoming('user1', 3);
      expect(mockRepo.findUpcoming).toHaveBeenCalledWith(3);
    });
  });

  describe('create', () => {
    it('Admin smí vytvořit akci', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      const res = await service.create(
        { title: 'Akce', date: '2026-06-01T18:00' },
        'user1',
        UserRole.Admin,
      );
      expect(res.title).toBe('Akce');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmable: true,
          attendeeUserIds: [],
          authorId: 'user1',
          isActive: true,
        }),
      );
    });

    it('Superadmin smí vytvořit akci', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await expect(
        service.create(
          { title: 'X', date: '2026-06-01T18:00' },
          'user1',
          UserRole.Superadmin,
        ),
      ).resolves.toBeDefined();
    });

    it('PJ NESMÍ vytvořit akci (platform obsah)', async () => {
      await expect(
        service.create(
          { title: 'X', date: '2026-06-01T18:00' },
          'user1',
          UserRole.PJ,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Hráč NESMÍ vytvořit akci', async () => {
      await expect(
        service.create(
          { title: 'X', date: '2026-06-01T18:00' },
          'user1',
          UserRole.Hrac,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('neplatné datum → 400', async () => {
      await expect(
        service.create(
          { title: 'X', date: 'neni-datum' },
          'user1',
          UserRole.Admin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('confirmable lze vypnout', async () => {
      mockRepo.create.mockResolvedValue({ ...mockItem, confirmable: false });
      await service.create(
        { title: 'X', date: '2026-06-01T18:00', confirmable: false },
        'user1',
        UserRole.Admin,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ confirmable: false }),
      );
    });
  });

  describe('update', () => {
    it('Admin smí update', async () => {
      mockRepo.update.mockResolvedValue({ ...mockItem, title: 'Nová' });
      const res = await service.update(
        'e1',
        { title: 'Nová' },
        'user1',
        UserRole.Admin,
      );
      expect(res.title).toBe('Nová');
    });

    it('PJ NESMÍ update', async () => {
      await expect(
        service.update('e1', { title: 'X' }, 'user1', UserRole.PJ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prázdný DTO → 400', async () => {
      await expect(
        service.update('e1', {}, 'user1', UserRole.Admin),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('neexistující id → 404', async () => {
      mockRepo.update.mockResolvedValue(null);
      await expect(
        service.update('x', { title: 'X' }, 'user1', UserRole.Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('imageUrl: null se propaguje do repo (odebrání obrázku)', async () => {
      mockRepo.update.mockResolvedValue(mockItem);
      await service.update('e1', { imageUrl: null }, 'user1', UserRole.Admin);
      expect(mockRepo.update).toHaveBeenCalledWith('e1', { imageUrl: null });
    });
  });

  describe('delete', () => {
    it('Admin smí smazat (hard delete)', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('e1', UserRole.Admin),
      ).resolves.toBeUndefined();
    });

    it('PJ NESMÍ smazat', async () => {
      await expect(service.delete('e1', UserRole.PJ)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('neexistující id → 404', async () => {
      mockRepo.delete.mockResolvedValue(false);
      await expect(service.delete('x', UserRole.Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    // CD-RUN-4b — hard delete s obrázkem uklidí blob (media.orphaned).
    it('CD-RUN-4b — smazání akce s obrázkem emituje media.orphaned', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'e1',
        imageUrl: 'https://cdn/e.jpg',
      });
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('e1', UserRole.Admin);
      expect(mockEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: ['https://cdn/e.jpg'],
      });
    });
  });

  describe('confirm (RSVP toggle)', () => {
    it('přidá uživatele mezi účastníky pokud tam není', async () => {
      mockRepo.findById.mockResolvedValue(mockItem);
      mockRepo.setAttendee.mockResolvedValue({
        ...mockItem,
        attendeeUserIds: ['user2'],
      });
      await service.confirm('e1', 'user2');
      expect(mockRepo.setAttendee).toHaveBeenCalledWith('e1', 'user2', true);
    });

    it('odebere uživatele pokud už účast potvrdil', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockItem,
        attendeeUserIds: ['user2'],
      });
      mockRepo.setAttendee.mockResolvedValue({
        ...mockItem,
        attendeeUserIds: [],
      });
      await service.confirm('e1', 'user2');
      expect(mockRepo.setAttendee).toHaveBeenCalledWith('e1', 'user2', false);
    });

    it('409 ConflictException pokud confirmable=false', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockItem, confirmable: false });
      await expect(service.confirm('e1', 'user2')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.setAttendee).not.toHaveBeenCalled();
    });

    it('404 pokud akce neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.confirm('x', 'user2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404 pokud akce je soft-deleted', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockItem, isActive: false });
      await expect(service.confirm('e1', 'user2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
