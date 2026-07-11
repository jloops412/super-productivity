import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GlobalTrackingIntervalService } from '../../core/global-tracking-interval/global-tracking-interval.service';

@Injectable({ providedIn: 'root' })
export class BreakTimerService {
  private readonly _trackingIntervalService = inject(GlobalTrackingIntervalService);
  private readonly _startedAt = signal<number | null>(null);
  private readonly _elapsed = signal(0);
  private readonly _targetDuration = signal(0);

  readonly isActive = computed(() => this._startedAt() !== null);
  readonly elapsed = this._elapsed.asReadonly();
  readonly targetDuration = this._targetDuration.asReadonly();
  readonly remaining = computed(() =>
    Math.max(this._targetDuration() - this._elapsed(), 0),
  );
  readonly progress = computed(() => {
    const duration = this._targetDuration();
    return duration > 0 ? Math.min((this._elapsed() / duration) * 100, 100) : 0;
  });
  readonly isTargetReached = computed(
    () => this.isActive() && this._elapsed() >= this._targetDuration(),
  );

  constructor() {
    this._trackingIntervalService.tick$
      .pipe(takeUntilDestroyed())
      .subscribe(({ timestamp }) => {
        if (this.isActive()) {
          this._updateElapsed(timestamp);
        }
      });
  }

  start(targetDuration: number): void {
    this._targetDuration.set(Math.max(targetDuration, 0));
    this._elapsed.set(0);
    this._startedAt.set(Date.now());
  }

  stop(): number {
    if (!this.isActive()) {
      return 0;
    }

    this._updateElapsed(Date.now());
    const elapsed = this._elapsed();
    this._startedAt.set(null);
    this._targetDuration.set(0);
    this._elapsed.set(0);
    return elapsed;
  }

  private _updateElapsed(timestamp: number): void {
    const startedAt = this._startedAt();
    if (startedAt !== null) {
      this._elapsed.set(Math.max(timestamp - startedAt, 0));
    }
  }
}
