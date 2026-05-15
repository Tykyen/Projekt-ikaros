import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IkarosCategoriesService } from './ikaros-categories.service';

const mockRepo = {
  findAll: jest.fn(),
  findByKey: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockArticlesRepo = { countByCategory: jest.fn() };

describe('IkarosCategoriesService', () => {
  let service: IkarosCategoriesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosCategoriesService,
        { provide: 'IArticleCategoriesRepository', useValue: mockRepo },
        { provide: 'IIkarosArticlesRepository', useValue: mockArticlesRepo },
      ],
    }).compile();
    service = module.get(IkarosCategoriesService);
  });

  it('findAll vrací seznam', async () => {
    mockRepo.findAll.mockResolvedValue([{ key: 'povidky' }]);
    const result = await service.findAll();
    expect(result).toEqual([{ key: 'povidky' }]);
  });

  it('findByKey existující → vrací entitu', async () => {
    mockRepo.findByKey.mockResolvedValue({ key: 'povidky' });
    const result = await service.findByKey('povidky');
    expect(result.key).toBe('povidky');
  });

  it('findByKey neexistující → NotFoundException', async () => {
    mockRepo.findByKey.mockResolvedValue(null);
    await expect(service.findByKey('zzz')).rejects.toThrow(NotFoundException);
  });

  it('existsByKey true / false', async () => {
    mockRepo.findByKey.mockResolvedValueOnce({ key: 'povidky' });
    expect(await service.existsByKey('povidky')).toBe(true);
    mockRepo.findByKey.mockResolvedValueOnce(null);
    expect(await service.existsByKey('zzz')).toBe(false);
  });

  it('create — duplikátní klíč → ConflictException', async () => {
    mockRepo.findByKey.mockResolvedValue({ key: 'povidky' });
    await expect(
      service.create({
        key: 'povidky',
        label: 'X',
        color: '#000000',
        order: 0,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('create — happy path → vrací entitu', async () => {
    mockRepo.findByKey.mockResolvedValue(null);
    mockRepo.create.mockResolvedValue({
      key: 'nove',
      label: 'Nové',
      color: '#000000',
      order: 0,
      createdAtUtc: new Date(),
    });
    const result = await service.create({
      key: 'nove',
      label: 'Nové',
      color: '#000000',
      order: 0,
    });
    expect(result.key).toBe('nove');
  });

  it('update — happy path', async () => {
    mockRepo.findByKey.mockResolvedValue({ key: 'povidky' });
    mockRepo.update.mockResolvedValue({ key: 'povidky', label: 'Nové' });
    const result = await service.update('povidky', { label: 'Nové' });
    expect(result.label).toBe('Nové');
  });

  it('delete in-use → ConflictException', async () => {
    mockRepo.findByKey.mockResolvedValue({ key: 'povidky' });
    mockArticlesRepo.countByCategory.mockResolvedValue(5);
    await expect(service.delete('povidky')).rejects.toThrow(ConflictException);
  });

  it('delete unused → no throw', async () => {
    mockRepo.findByKey.mockResolvedValue({ key: 'povidky' });
    mockArticlesRepo.countByCategory.mockResolvedValue(0);
    await expect(service.delete('povidky')).resolves.toBeUndefined();
    expect(mockRepo.delete).toHaveBeenCalledWith('povidky');
  });
});
