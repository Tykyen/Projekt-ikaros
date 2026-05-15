import { GalleryReviewProvider } from './gallery-review.provider';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';

describe('GalleryReviewProvider', () => {
  const mockRepo = {
    countPending: jest.fn(),
    findPendingPaginated: jest.fn(),
  };
  const provider = new GalleryReviewProvider(mockRepo as never);

  beforeEach(() => jest.clearAllMocks());

  it('má typ gallery_pending_review', () => {
    expect(provider.type).toBe(PendingActionType.GalleryPendingReview);
  });

  describe('canHandle', () => {
    it('SpravceGalerie ano', () =>
      expect(provider.canHandle('u', UserRole.SpravceGalerie)).toBe(true));
    it('Admin ano', () =>
      expect(provider.canHandle('u', UserRole.Admin)).toBe(true));
    it('PJ ne (platformový obsah)', () =>
      expect(provider.canHandle('u', UserRole.PJ)).toBe(false));
    it('Hráč ne', () =>
      expect(provider.canHandle('u', UserRole.Hrac)).toBe(false));
  });

  describe('countForUser', () => {
    it('non-reviewer dostane 0', async () => {
      expect(await provider.countForUser('u', UserRole.Hrac)).toBe(0);
      expect(mockRepo.countPending).not.toHaveBeenCalled();
    });
    it('reviewer dostane počet Pending', async () => {
      mockRepo.countPending.mockResolvedValue(4);
      expect(await provider.countForUser('u', UserRole.Admin)).toBe(4);
    });
  });

  describe('listForUser', () => {
    it('mapuje obrázky na review položky', async () => {
      mockRepo.findPendingPaginated.mockResolvedValue([
        {
          id: 'gal1',
          title: 'Obrázek',
          imageUrl: 'https://cdn/g.jpg',
          category: 'fanart',
          authorId: 'a1',
          authorName: 'Autor',
          updatedAtUtc: new Date('2026-05-15T10:00:00Z'),
        },
      ]);
      mockRepo.countPending.mockResolvedValue(1);
      const result = await provider.listForUser('u', UserRole.Admin, 1, 10);
      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        imageId: 'gal1',
        title: 'Obrázek',
        imageUrl: 'https://cdn/g.jpg',
        category: 'fanart',
        authorId: 'a1',
        authorName: 'Autor',
        submittedAt: '2026-05-15T10:00:00.000Z',
      });
    });

    it('non-reviewer dostane prázdný seznam', async () => {
      const result = await provider.listForUser('u', UserRole.Hrac, 1, 10);
      expect(result).toEqual({ items: [], total: 0 });
    });
  });
});
