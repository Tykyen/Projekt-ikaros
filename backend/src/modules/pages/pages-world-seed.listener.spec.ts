import { PagesWorldSeedListener } from './pages-world-seed.listener';
import { TipTapExtractor } from './tiptap-extractor.service';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { World } from '../worlds/interfaces/world.interface';
import type { Page } from './interfaces/page.interface';

describe('PagesWorldSeedListener — seed Pravidel dle systému (2.3c)', () => {
  let saved: Partial<Page>[];
  let repo: Pick<IPagesRepository, 'existsBySlugAndWorld' | 'save'>;
  let listener: PagesWorldSeedListener;

  beforeEach(() => {
    saved = [];
    repo = {
      existsBySlugAndWorld: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockImplementation((p: Partial<Page>) => {
        saved.push(p);
        return Promise.resolve(p as Page);
      }),
    };
    listener = new PagesWorldSeedListener(
      repo as IPagesRepository,
      new TipTapExtractor(),
    );
  });

  const world = (
    system: string,
    techLevelMin?: number,
    techLevelMax?: number,
    magicTraditions?: string[],
  ): World =>
    ({
      id: 'w1',
      system,
      techLevelMin,
      techLevelMax,
      magicTraditions,
    }) as World;
  const pravidla = () => saved.find((p) => p.slug === 'pravidla');
  const technologie = () => saved.find((p) => p.slug === 'technologie');
  const magie = () => saved.find((p) => p.slug === 'magicky-system');

  it('seeduje všech 5 šablon', async () => {
    await listener.handleWorldCreated(world('dnd5e'));
    expect(saved).toHaveLength(5);
  });

  it('Pravidla dostanou text systému + dohledatelný plainText', async () => {
    await listener.handleWorldCreated(world('dnd5e'));
    const p = pravidla();
    expect(p?.content).toContain('<h2>');
    expect(p?.content).toContain('k20');
    expect(p?.plainText).not.toBe('');
    expect(p?.plainText).not.toContain('<'); // tagy strhnuté
    expect(p?.plainText).toContain('k20');
  });

  it('matrix (zatím bez dodaných dat) → prázdná Pravidla', async () => {
    await listener.handleWorldCreated(world('matrix'));
    expect(pravidla()?.content).toBe('');
    expect(pravidla()?.plainText).toBe('');
  });

  it('vlastni / neznámý systém → prázdná Pravidla', async () => {
    await listener.handleWorldCreated(world('vlastni'));
    expect(pravidla()?.content).toBe('');
    await listener.handleWorldCreated(world('neco-neznameho'));
    // 2 světy × 5 šablon
    expect(saved.filter((p) => p.slug === 'pravidla')).toHaveLength(2);
    expect(
      saved.filter((p) => p.slug === 'pravidla').every((p) => p.content === ''),
    ).toBe(true);
  });

  it('FAQ + videa zůstávají prázdné', async () => {
    await listener.handleWorldCreated(world('fate'));
    expect(saved.find((p) => p.slug === 'faq')?.content).toBe('');
    expect(saved.find((p) => p.slug === 'videa')?.content).toBe('');
  });

  it('Magický systém obsahuje univerzální škálu MÚ 0–14 bez tabulek', async () => {
    await listener.handleWorldCreated(world('fate'));
    const m = magie();
    expect(m?.content).toContain('MÚ 0');
    expect(m?.content).toContain('MÚ 14');
    expect(m?.content).not.toContain('<table');
    expect(m?.plainText).not.toBe('');
  });

  it('Magický systém vypíše zvolené tradice', async () => {
    await listener.handleWorldCreated(
      world('fate', undefined, undefined, ['Vílí', 'Krevní']),
    );
    const m = magie();
    expect(m?.content).toContain('Magie tohoto světa');
    expect(m?.content).toContain('Vílí, Krevní');
  });

  it('Magický systém bez tradic vynechá sekci „Magie tohoto světa"', async () => {
    await listener.handleWorldCreated(world('fate'));
    expect(magie()?.content).not.toContain('Magie tohoto světa');
  });

  it('Technologie obsahují univerzální škálu TÚ 0–14 bez tabulek', async () => {
    await listener.handleWorldCreated(world('fate'));
    const t = technologie();
    expect(t?.content).toContain('TÚ 0');
    expect(t?.content).toContain('TÚ 14');
    expect(t?.content).not.toContain('<table');
    expect(t?.plainText).not.toBe('');
    expect(t?.plainText).not.toContain('<');
  });

  it('Technologie vypíšou rozsah TÚ tohoto světa', async () => {
    await listener.handleWorldCreated(world('fate', 4, 6));
    const t = technologie();
    expect(t?.content).toContain('Tento svět');
    expect(t?.content).toContain('TÚ 4–6'); // en dash
  });

  it('Technologie bez zadaného rozsahu vynechají sekci „Tento svět"', async () => {
    await listener.handleWorldCreated(world('fate'));
    expect(technologie()?.content).not.toContain('Tento svět');
  });

  it('už existující stránku přeskočí (idempotence)', async () => {
    (repo.existsBySlugAndWorld as jest.Mock).mockResolvedValue(true);
    await listener.handleWorldCreated(world('fate'));
    expect(saved).toHaveLength(0);
  });
});
