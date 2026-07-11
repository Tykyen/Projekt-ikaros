import { Injectable } from '@nestjs/common';
import { AlertService } from './alert.service';

/**
 * Monitoring (3. noha) — detekce brute-force loginu. Počítá selhání přihlášení
 * (`INVALID_CREDENTIALS`) v posuvném okně; při překročení prahu alertuje.
 *
 * Agregátní signál (ne per-IP) — jednoduchý, ale spolehlivě chytí flood pokusů
 * (i rotací IP, kterou per-IP throttler mine). Volá se z global exception filtru,
 * takže bez zásahu do AuthService.
 */
@Injectable()
export class BruteForceMonitor {
  private failures: number[] = [];
  private readonly windowMs = 60_000; // 1 min okno
  private readonly threshold = 20; // >20 selhání/min = podezřelé

  constructor(private readonly alert: AlertService) {}

  recordLoginFailure(): void {
    const now = Date.now();
    this.failures = this.failures.filter((t) => now - t < this.windowMs);
    this.failures.push(now);
    if (this.failures.length >= this.threshold) {
      void this.alert.alert(
        'critical',
        'Brute-force login spike',
        `${this.failures.length}× neúspěšné přihlášení za poslední minutu — možný útok na účty.`,
        { dedupeKey: 'bruteforce-login', cooldownMs: 10 * 60 * 1000 },
      );
    }
  }
}
