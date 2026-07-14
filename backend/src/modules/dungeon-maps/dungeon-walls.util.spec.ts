import { dungeonWallsToMapWalls } from './dungeon-walls.util';
import type { DungeonCell } from './interfaces/dungeon-map.interface';

/**
 * Postaví grid z ASCII: `#` skála, `.` podlaha, `D` dveře, `L` zamčené,
 * `A` průchod; město: `B` budova, `W` hradba, `G` brána, `s` ulice, mezera terén.
 */
const grid = (rows: string[]): DungeonCell[][] =>
  rows.map((row) =>
    [...row].map((ch): DungeonCell => {
      switch (ch) {
        case '.':
          return { type: 'floor' };
        case 'D':
          return { type: 'door' };
        case 'L':
          return { type: 'door-locked' };
        case 'A':
          return { type: 'archway' };
        case 'B':
          return { type: 'building' };
        case 'W':
          return { type: 'city-wall' };
        case 'G':
          return { type: 'gate' };
        case 's':
          return { type: 'street' };
        case 'F':
          return { type: 'forest' };
        case 'M':
          return { type: 'mountain' };
        case 'h':
          return { type: 'hill' };
        case 'p':
          return { type: 'field' };
        case ' ':
          return { type: 'empty' };
        default:
          return { type: 'empty' };
      }
    }),
  );

const make = (
  rows: string[],
  cellSize = 10,
  mapKind: 'dungeon' | 'city' | 'wilderness' = 'dungeon',
) => ({
  cells: grid(rows),
  gridHeight: rows.length,
  gridWidth: rows[0].length,
  cellSize,
  mapKind,
});

describe('dungeonWallsToMapWalls (21.3b)', () => {
  it('jediná podlaha → 4 zdi kolem, žádné dveře', () => {
    const walls = dungeonWallsToMapWalls(make(['###', '#.#', '###']));
    const plain = walls.filter((w) => w.type === 'wall');
    expect(plain).toHaveLength(4);
    expect(walls.filter((w) => w.type === 'door')).toHaveLength(0);
    // Buňka (1,1) při cellSize 10 → obvod mezi (10,10) a (20,20).
    const segs = plain.map((w) => w.points.join(','));
    expect(segs).toContain('10,10,20,10'); // horní
    expect(segs).toContain('10,20,20,20'); // dolní
    expect(segs).toContain('10,10,10,20'); // levá
    expect(segs).toContain('20,10,20,20'); // pravá
    expect(plain.every((w) => w.blocksSight)).toBe(true);
  });

  it('vodorovná chodba 3 buněk → slité běhy (1 horní + 1 dolní + 2 čela)', () => {
    const walls = dungeonWallsToMapWalls(make(['#####', '#...#', '#####']));
    const plain = walls.filter((w) => w.type === 'wall');
    expect(plain).toHaveLength(4);
    const segs = plain.map((w) => w.points.join(','));
    expect(segs).toContain('10,10,40,10'); // horní běh přes 3 buňky
    expect(segs).toContain('10,20,40,20'); // dolní běh
  });

  it('dveře na vodorovné chodbě → svislý door segment středem buňky', () => {
    const walls = dungeonWallsToMapWalls(make(['#####', '#.D.#', '#####']));
    const doors = walls.filter((w) => w.type === 'door');
    expect(doors).toHaveLength(1);
    // Buňka (2,1): střed x = 25, napříč y 10→20.
    expect(doors[0].points).toEqual([25, 10, 25, 20]);
    expect(doors[0].door).toEqual({ open: false, locked: false });
    expect(doors[0].blocksSight).toBe(true);
  });

  it('svislá chodba → vodorovný door segment; zamčené locked:true', () => {
    const walls = dungeonWallsToMapWalls(
      make(['###', '#.#', '#L#', '#.#', '###']),
    );
    const doors = walls.filter((w) => w.type === 'door');
    expect(doors).toHaveLength(1);
    // Buňka (1,2): napříč x 10→20, střed y = 25.
    expect(doors[0].points).toEqual([10, 25, 20, 25]);
    expect(doors[0].door).toEqual({ open: false, locked: true });
  });

  it('archway = volný průchod bez door objektu', () => {
    const walls = dungeonWallsToMapWalls(make(['#####', '#.A.#', '#####']));
    expect(walls.filter((w) => w.type === 'door')).toHaveLength(0);
    // Průchod je walkable → boční zdi chodby jedou souvisle dál.
    const segs = walls.map((w) => w.points.join(','));
    expect(segs).toContain('10,10,40,10');
  });

  it('dveřní buňka je průchozí — hranice zdí ji neprotíná', () => {
    const walls = dungeonWallsToMapWalls(make(['#####', '#.D.#', '#####']));
    const plain = walls.filter((w) => w.type === 'wall');
    // Stejné 4 obvodové segmenty jako u plné chodby (dveře nejsou skála).
    expect(plain).toHaveLength(4);
  });

  it('id segmentů jsou unikátní', () => {
    const walls = dungeonWallsToMapWalls(make(['#####', '#.#.#', '#####']));
    const ids = new Set(walls.map((w) => w.id));
    expect(ids.size).toBe(walls.length);
  });

  describe('město (21.3e)', () => {
    it('samostatná budova na terénu → 4 obvodové zdi (pozitiv)', () => {
      const walls = dungeonWallsToMapWalls(
        make(['   ', ' B ', '   '], 10, 'city'),
      );
      const plain = walls.filter((w) => w.type === 'wall');
      expect(plain).toHaveLength(4);
      expect(walls.filter((w) => w.type === 'door')).toHaveLength(0);
      const segs = plain.map((w) => w.points.join(','));
      expect(segs).toContain('10,10,20,10');
      expect(segs).toContain('10,20,20,20');
    });

    it('otevřený terén neblokuje na okraji mapy (žádná obvodová zeď)', () => {
      const walls = dungeonWallsToMapWalls(make(['   ', '   '], 10, 'city'));
      expect(walls).toHaveLength(0);
    });

    it('brána v hradbě → door segment; hradba se slévá po bězích', () => {
      const walls = dungeonWallsToMapWalls(
        make(['WWGWW', 'ss ss'], 10, 'city'),
      );
      const doors = walls.filter((w) => w.type === 'door');
      expect(doors).toHaveLength(1);
      // Brána (2,0): sousedé vlevo/vpravo jsou hradby (blokují) → svislý
      // průchod (terén nad/pod mimo grid je volný) → vodorovný segment.
      expect(doors[0].points).toEqual([20, 5, 30, 5]);
      expect(doors[0].door).toEqual({ open: false, locked: false });
      // Zdi hradby: běhy vlevo (0–2) a vpravo (3–5) v obou vodorovných
      // hranách + svislé kraje + hrany kolem brány.
      const segs = walls
        .filter((w) => w.type === 'wall')
        .map((w) => w.points.join(','));
      expect(segs).toContain('0,0,20,0');
      expect(segs).toContain('30,0,50,0');
    });

    it('krajina (21.3g): les/hory blokují, kopce/pole ne, žádné dveře', () => {
      const walls = dungeonWallsToMapWalls(
        make([' F ', ' M ', ' hp'], 10, 'wilderness'),
      );
      // Les (1,0) + hora (1,1) = souvislý svislý blok 1×2 → obvod 6 segmentů
      // po run-merge: horní, dolní, 2× levý+pravý? levá hrana běh 0–2 = 1
      // segment, pravá taky → 4 segmenty celkem.
      const plain = walls.filter((w) => w.type === 'wall');
      const segs = plain.map((w) => w.points.join(','));
      expect(segs).toContain('10,0,20,0'); // nad lesem
      expect(segs).toContain('10,20,20,20'); // pod horou
      expect(segs).toContain('10,0,10,20'); // levý slitý běh
      expect(segs).toContain('20,0,20,20'); // pravý slitý běh
      expect(plain).toHaveLength(4);
      // Kopec a pole žádné zdi nepřidávají, dveře v krajině nejsou.
      expect(walls.filter((w) => w.type === 'door')).toHaveLength(0);
    });

    it('dungeon dveře nejsou ve městě dveřmi (a naopak brána v dungeonu ne)', () => {
      const city = dungeonWallsToMapWalls(make(['BDB'], 10, 'city'));
      expect(city.filter((w) => w.type === 'door')).toHaveLength(0);
      const dungeon = dungeonWallsToMapWalls(make(['#G#'], 10, 'dungeon'));
      expect(dungeon.filter((w) => w.type === 'door')).toHaveLength(0);
    });
  });
});
