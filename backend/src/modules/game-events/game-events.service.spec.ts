import { Test } from '@nestjs/testing';
import { GameEventsService } from './game-events.service';
import { NotFoundException } from '@nestjs/common';

describe('GameEventsService', () => {
  let service: GameEventsService;
  const mockRepo = {
    findByWorld: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    confirm: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GameEventsService,
        { provide: 'IGameEventRepository', useValue: mockRepo },
      ],
    }).compile();
    service = module.get(GameEventsService);
    jest.clearAllMocks();
  });

  it('findByWorld vrátí eventy pro daný svět', async () => {
    mockRepo.findByWorld.mockResolvedValue([{ id: '1', worldId: 'w1', title: 'Test', date: '2026-06-01', reminderSent: false, createdAt: new Date(), updatedAt: new Date() }]);
    const result = await service.findByWorld('w1');
    expect(result).toHaveLength(1);
    expect(mockRepo.findByWorld).toHaveBeenCalledWith('w1');
  });

  it('findOne vyhodí NotFoundException pokud event neexistuje', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('findOne vrátí event pokud existuje', async () => {
    const event = { id: 'e1', worldId: 'w1', title: 'Test', date: '2026-06-01', reminderSent: false, createdAt: new Date(), updatedAt: new Date() };
    mockRepo.findOne.mockResolvedValue(event);
    const result = await service.findOne('e1');
    expect(result).toEqual(event);
  });

  it('create vytvoří nový event', async () => {
    const dto = { worldId: 'w1', title: 'Bitva', date: '2026-06-01', description: 'desc' };
    const created = { id: 'e1', ...dto, reminderSent: false, createdAt: new Date(), updatedAt: new Date() };
    mockRepo.create.mockResolvedValue(created);
    const result = await service.create(dto);
    expect(result.title).toBe('Bitva');
    expect(mockRepo.create).toHaveBeenCalledWith({ ...dto, reminderSent: false });
  });

  it('update vyhodí NotFoundException pokud event neexistuje', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.update('nonexistent', { title: 'new' })).rejects.toThrow(NotFoundException);
  });

  it('delete vyhodí NotFoundException pokud event neexistuje', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('confirm nastaví reminderSent na true', async () => {
    const event = { id: 'e1', worldId: 'w1', title: 'Test', date: '2026-06-01', reminderSent: false, createdAt: new Date(), updatedAt: new Date() };
    mockRepo.findOne.mockResolvedValue(event);
    mockRepo.confirm.mockResolvedValue({ ...event, reminderSent: true });
    const result = await service.confirm('e1');
    expect(result.reminderSent).toBe(true);
  });
});
