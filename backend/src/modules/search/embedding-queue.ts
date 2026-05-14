import type { Page } from '../pages/interfaces/page.interface';
import { Logger } from '@nestjs/common';

export type QueueOperation =
  | { type: 'Upsert'; page: Page }
  | { type: 'Delete'; slug: string }
  | { type: 'Rebuild' };

export type QueueHandler = (op: QueueOperation) => Promise<void>;

export class EmbeddingQueue {
  private readonly logger = new Logger(EmbeddingQueue.name);
  private readonly queue: QueueOperation[] = [];
  private readonly backlog: QueueOperation[] = [];
  private isRebuilding = false;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private resolver: (() => void) | null = null;

  constructor(private readonly handler: QueueHandler) {}

  start(): void {
    this.isRunning = true;
    void this.processLoop();
  }

  stop(): void {
    this.isRunning = false;
    this.resolver?.();
  }

  enqueue(op: QueueOperation): void {
    if (op.type === 'Rebuild') {
      // Zruš aktuální rebuild, vyčisti frontu
      this.abortController?.abort();
      this.queue.length = 0;
      this.backlog.length = 0;
    }

    if (this.isRebuilding && (op.type === 'Upsert' || op.type === 'Delete')) {
      this.backlog.push(op);
      return;
    }

    this.queue.push(op);
    this.resolver?.();
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      if (this.queue.length === 0) {
        await new Promise<void>((r) => {
          this.resolver = r;
        });
        this.resolver = null;
        continue;
      }

      const op = this.queue.shift()!;

      if (op.type === 'Rebuild') {
        this.isRebuilding = true;
        this.abortController = new AbortController();
        try {
          await this.handler(op);
        } catch (err) {
          this.logger.error('Rebuild selhal', err);
        } finally {
          this.isRebuilding = false;
          this.abortController = null;
          // Vrať backlog do fronty
          this.queue.unshift(...this.backlog.splice(0));
        }
      } else {
        try {
          await this.handler(op);
        } catch (err) {
          this.logger.error(`Operace ${op.type} selhala`, err);
        }
      }
    }
  }
}
