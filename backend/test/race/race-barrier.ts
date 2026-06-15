/**
 * Race-condition harness (15. styl auditu — „Race-condition mini testy").
 *
 * Plán: docs/race-condition-plan/. Registr nálezů: docs/race-condition-audit.md.
 *
 * Souběhovou chybu nelze dokázat staticky — jen reálně závoděným testem. Pouhý
 * `Promise.all` je ale *probabilistický* (někdy okno netrefí → flaky / falešně
 * zelený). Tyto primitiva vynutí **deterministický interleave**:
 *
 *  - `Barrier(parties)` — symetrický závod: N stejných operací se sejde v
 *    kritickém bodě a teprve pak pokračují společně (vynutí „oba čtou před tím,
 *    než kdokoli zapíše"). Má **timeout-fallback**, aby zelený (opravený) kód,
 *    kde druhá operace ke kritickému bodu nikdy nedojde, nezablokoval test.
 *
 *  - `Gate` — asymetrický závod: drž operaci A v bodě X, mezitím nech doběhnout
 *    operaci B, pak A pusť (vynutí „append B proběhl mezi readem a writem A").
 *
 * Obě se zapojují přes `jest.spyOn` na service/repo metodu — viz `withGate` /
 * `withBarrier` helpery, které obalí originál a po doběhu spy obnoví.
 */

export class Barrier {
  private arrived = 0;
  private releasers: Array<() => void> = [];
  private released = false;

  constructor(
    private readonly parties: number,
    private readonly timeoutMs = 3000,
  ) {}

  /** Zavolej v kritickém bodě. Resolvne, až dorazí `parties` volajících
   *  (nebo po `timeoutMs` — aby opravený kód, kde druhá strana nedorazí,
   *  nezablokoval na deadlocku). */
  async arrive(): Promise<void> {
    if (this.released) return;
    this.arrived += 1;
    if (this.arrived >= this.parties) {
      this.releaseAll();
      return;
    }
    return new Promise<void>((resolve) => {
      this.releasers.push(resolve);
      // Timeout pojistka — drahá zelená cesta se nesmí zaseknout.
      setTimeout(() => this.releaseAll(), this.timeoutMs);
    });
  }

  private releaseAll(): void {
    if (this.released) return;
    this.released = true;
    for (const r of this.releasers) r();
    this.releasers = [];
  }
}

export class Gate {
  private opened = false;
  private waiters: Array<() => void> = [];
  private reachedResolve!: () => void;
  private reachedFired = false;
  /** Resolvne při PRVNÍM `held()` — tj. operace A dosáhla bodu X (po readu,
   *  před writem). Test na to počká, než spustí operaci B. */
  readonly reached: Promise<void>;

  constructor() {
    this.reached = new Promise<void>((r) => {
      this.reachedResolve = r;
    });
  }

  /** Zavolej v kritickém bodě operace A. Drží, dokud test nezavolá `open()`. */
  async held(): Promise<void> {
    if (!this.reachedFired) {
      this.reachedFired = true;
      this.reachedResolve();
    }
    if (this.opened) return;
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  open(): void {
    this.opened = true;
    for (const w of this.waiters) w();
    this.waiters = [];
  }
}

type AnyFn = (...args: any[]) => any;

/**
 * Obalí metodu `target[method]` bariérou: každé volání nejdřív `barrier.arrive()`
 * (počká na ostatní volající), pak originál. Vrací restore fn (zavolej v finally).
 */
export function withBarrier<T extends object>(
  target: T,
  method: keyof T,
  barrier: Barrier,
): () => void {
  const orig = (target[method] as AnyFn).bind(target);
  const spy = jest
    .spyOn(target as any, method as any)
    .mockImplementation(async (...args: any[]) => {
      await barrier.arrive();
      return orig(...args);
    });
  return () => spy.mockRestore();
}

/**
 * Obalí metodu bránou: volání drží v `gate.held()` (po vstupu do metody),
 * dokud test nezavolá `gate.open()`. Pozn.: drží na ZAČÁTKU metody — pokud
 * čtení proběhlo VÝŠE (u undoLast čte service před voláním repo.update),
 * obal repo.update → drží přesně mezi readem (service) a writem (repo).
 */
export function withGate<T extends object>(
  target: T,
  method: keyof T,
  gate: Gate,
  onlyFirst = true,
): () => void {
  const orig = (target[method] as AnyFn).bind(target);
  let used = false;
  const spy = jest
    .spyOn(target as any, method as any)
    .mockImplementation(async (...args: any[]) => {
      if (!onlyFirst || !used) {
        used = true;
        await gate.held();
      }
      return orig(...args);
    });
  return () => spy.mockRestore();
}
