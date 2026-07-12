import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Connection } from 'mongoose';
import type { Redis } from 'ioredis';
import { AlertService } from '../alerting/alert.service';
import {
  CheckResult,
  checkDisk,
  checkMeili,
  checkMongo,
  checkRedis,
} from './health-checks';

/**
 * Monitoring (3. noha) — periodický health-cron. Á 2 min ověří kritické
 * závislosti (Mongo/Redis/Meili) a alertuje POUZE PŘI PŘECHODU:
 *  - nově DOWN → 🔴 critical (aby ses o pádu dozvěděl do 2 min, ne od hráčů),
 *  - nově OBNOVENO → ℹ️ info.
 * Neposílá „still down" každé 2 min (drží stav v `lastDown`), AlertService navíc
 * rate-limituje. Alert je fire-and-forget a chybu nesmí eskalovat.
 */
@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);
  private lastDown = new Set<string>();
  // RSS vzorky (1×/min) pro trend-detekci leaku. Reset při restartu = správně
  // (nový proces nedědí staré vzorky). Bounded na RSS_WINDOW.
  private rssHistory: number[] = [];

  constructor(
    @InjectConnection() private readonly mongo: Connection,
    @Inject('REDIS') private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly alert: AlertService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async check(): Promise<void> {
    const results: Record<string, CheckResult> = {
      mongo: checkMongo(this.mongo),
      redis: await checkRedis(this.redis),
      meili: await checkMeili(
        this.config.get<string>('MEILI_HOST', 'http://localhost:7700'),
      ),
    };

    const nowDown = new Set<string>();
    for (const [name, r] of Object.entries(results)) {
      if (!r.ok) {
        nowDown.add(name);
        if (!this.lastDown.has(name)) {
          this.logger.error(`Závislost DOWN: ${name} (${r.detail ?? ''})`);
          void this.alert.alert(
            'critical',
            `Závislost DOWN: ${name}`,
            r.detail ?? 'nedostupné',
            { dedupeKey: `dep-down:${name}`, cooldownMs: 5 * 60 * 1000 },
          );
        }
      } else if (this.lastDown.has(name)) {
        this.logger.log(`Závislost OBNOVENA: ${name}`);
        void this.alert.alert(
          'info',
          `Závislost OBNOVENA: ${name}`,
          'zpět online',
          { dedupeKey: `dep-up:${name}` },
        );
      }
    }
    this.lastDown = nowDown;

    // Disk — samostatně (warn, ne critical: <15 % volných je varování, ne výpadek).
    // Vlastní cooldown 30 min, ať to nespamuje, když je disk trvale plný.
    const disk = await checkDisk();
    if (!disk.ok) {
      this.logger.warn(`Disk skoro plný: ${disk.detail ?? ''}`);
      void this.alert.alert('warn', 'Disk skoro plný', disk.detail ?? '', {
        dedupeKey: 'disk-low',
        cooldownMs: 30 * 60 * 1000,
      });
    }

    // Paměť — leak se pozná z TRENDU (trvalý růst), NE z absolutní hodnoty.
    // Vysoká baseline (např. ~2 GB ONNX embedding modely in-process) je legitimní
    // a fixní práh na ní jen spamuje „možný leak" à 30 min. Reálný leak = RSS
    // roste; baseline = RSS je plochá. Držíme okno vzorků (1×/min) a alertujeme:
    //  (a) TREND: RSS trvale nad minimem okna → možný leak (nezávisle na baseline),
    //  (b) TVRDÝ STROP: blízko OOM → critical bez ohledu na trend.
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const windowMin = Number(this.config.get<string>('RSS_WINDOW') ?? '30'); // ~30 min
    this.rssHistory.push(rssMb);
    if (this.rssHistory.length > windowMin) this.rssHistory.shift();

    // (a) Trend: current výrazně nad MINIMEM okna = RSS leze nahoru. Minimum (ne
    // nejstarší vzorek) je odolné proti krátkému spiku (export/PDF) na kraji okna.
    const growthFloorMb = Number(
      this.config.get<string>('RSS_LEAK_GROWTH_MB') ?? '384',
    );
    if (this.rssHistory.length >= windowMin) {
      const lo = Math.min(...this.rssHistory);
      const growth = rssMb - lo;
      if (growth >= growthFloorMb && rssMb >= lo * 1.2) {
        void this.alert.alert(
          'warn',
          'Rostoucí paměť (RSS trend)',
          `RSS +${growth} MB nad minimum okna (${lo}→${rssMb} MB) za ~${windowMin} min — možný memory leak.`,
          { dedupeKey: 'rss-leak-trend', cooldownMs: 30 * 60 * 1000 },
        );
      }
    }

    // (b) Tvrdý strop: skutečná blízkost OOM → critical. Default 3500 MB (vysoko,
    // ať nefiluje na baseline); sniž přes RSS_HARD_MB dle RAM boxu. (Starý
    // RSS_ALERT_MB se už nepoužívá — nahrazeno trendem + tvrdým stropem.)
    const rssHard = Number(this.config.get<string>('RSS_HARD_MB') ?? '3500');
    if (rssMb > rssHard) {
      void this.alert.alert(
        'critical',
        'Kritická paměť (RSS)',
        `${rssMb} MB > tvrdý strop ${rssHard} MB — hrozí OOM kill.`,
        { dedupeKey: 'rss-critical', cooldownMs: 30 * 60 * 1000 },
      );
    }
  }

  /**
   * Heartbeat — jednou denně „monitoring žije". Dead-man's switch ze STRANY
   * aplikace: když tahle zpráva přestane chodit, monitoring/BE nejede (doplňuje
   * externí UptimeRobot, který hlídá z druhé strany).
   */
  @Cron(CronExpression.EVERY_DAY_AT_NOON)
  heartbeat(): void {
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const uptimeH = (process.uptime() / 3600).toFixed(1);
    void this.alert.alert(
      'info',
      '✅ Monitoring žije',
      `Uptime ${uptimeH} h · RSS ${rssMb} MB. Když tahle zpráva přestane chodit, BE/monitoring nejede.`,
      { dedupeKey: 'heartbeat', cooldownMs: 60 * 60 * 1000 },
    );
  }
}
