import { ArticleReviewProvider } from './article-review.provider';
import { UserRole } from '../users/interfaces/user.interface';
import type { IIkarosArticlesRepository } from './interfaces/ikaros-articles-repository.interface';

const mockRepo: jest.Mocked<IIkarosArticlesRepository> = {
  findPublished: jest.fn(),
  findPublishedAndPending: jest.fn(),
  searchPublished: jest.fn(),
  searchPublishedAndPending: jest.fn(),
  findPending: jest.fn(),
  findByAuthor: jest.fn(),
  countByAuthor: jest.fn(),
  findByIds: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  upsertRating: jest.fn(),
  delete: jest.fn(),
  countByAuthorAndStatus: jest.fn(),
  findPendingPaginated: jest.fn(),
  countByStatus: jest.fn(),
  countByCategory: jest.fn(),
  findPublishedIds: jest.fn(),
  countAll: jest.fn(),
};

describe('ArticleReviewProvider', () => {
  let provider: ArticleReviewProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new ArticleReviewProvider(mockRepo);
  });

  describe('canHandle', () => {
    it('Superadmin → true', () =>
      expect(provider.canHandle('u1', UserRole.Superadmin)).toBe(true));
    it('Admin → true', () =>
      expect(provider.canHandle('u1', UserRole.Admin)).toBe(true));
    it('SpravceClanku → true', () =>
      expect(provider.canHandle('u1', UserRole.SpravceClanku)).toBe(true));
    it('Ikarus (běžný uživatel) → false', () =>
      expect(provider.canHandle('u1', UserRole.Ikarus)).toBe(false));
    it('SpravceGalerie (jiný správce) → false', () =>
      expect(provider.canHandle('u1', UserRole.SpravceGalerie)).toBe(false));
    it('Hrac → false', () =>
      expect(provider.canHandle('u1', UserRole.Hrac)).toBe(false));
  });

  describe('countForUser', () => {
    it('reviewer → vrací počet Pending', async () => {
      mockRepo.countByStatus.mockResolvedValue(7);
      const result = await provider.countForUser('u1', UserRole.Admin);
      expect(result).toBe(7);
      expect(mockRepo.countByStatus).toHaveBeenCalledWith('Pending');
    });

    it('non-reviewer → 0 bez DB callu', async () => {
      const result = await provider.countForUser('u1', UserRole.Ikarus);
      expect(result).toBe(0);
      expect(mockRepo.countByStatus).not.toHaveBeenCalled();
    });
  });

  describe('listForUser', () => {
    it('reviewer → paginuje, mapuje payload', async () => {
      mockRepo.findPendingPaginated.mockResolvedValue([
        {
          id: 'a1',
          title: 'Test',
          content: '<p>Lorem ipsum dolor sit amet.</p>',
          category: 'povidky',
          authorId: 'u2',
          authorName: 'Autor',
          status: 'Pending',
          ratings: [],
          averageRating: 0,
          createdAtUtc: new Date('2026-05-01T10:00:00Z'),
          updatedAtUtc: new Date('2026-05-15T12:00:00Z'),
        },
      ]);
      mockRepo.countByStatus.mockResolvedValue(1);

      const result = await provider.listForUser('u1', UserRole.Admin, 1, 20);

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        articleId: 'a1',
        title: 'Test',
        preview: 'Lorem ipsum dolor sit amet.',
        category: 'povidky',
        authorId: 'u2',
        authorName: 'Autor',
        submittedAt: '2026-05-15T12:00:00.000Z',
      });
      expect(mockRepo.findPendingPaginated).toHaveBeenCalledWith(0, 20);
    });

    it('paginace page=3 limit=10 → offset 20', async () => {
      mockRepo.findPendingPaginated.mockResolvedValue([]);
      mockRepo.countByStatus.mockResolvedValue(0);
      await provider.listForUser('u1', UserRole.Admin, 3, 10);
      expect(mockRepo.findPendingPaginated).toHaveBeenCalledWith(20, 10);
    });

    it('non-reviewer → prázdný response', async () => {
      const result = await provider.listForUser('u1', UserRole.Hrac, 1, 20);
      expect(result).toEqual({ items: [], total: 0 });
      expect(mockRepo.findPendingPaginated).not.toHaveBeenCalled();
    });
  });

  describe('stripHtml', () => {
    it('odstraní HTML tagy', () => {
      expect(
        ArticleReviewProvider.stripHtml('<p><strong>Bold</strong> text</p>'),
      ).toBe('Bold text');
    });

    it('decoduje běžné entities', () => {
      expect(
        ArticleReviewProvider.stripHtml('&quot;Hello&quot; &amp; bye'),
      ).toBe('"Hello" & bye');
    });

    it('collapsuje whitespace', () => {
      expect(ArticleReviewProvider.stripHtml('a\n\n   b\t\tc')).toBe('a b c');
    });
  });
});
