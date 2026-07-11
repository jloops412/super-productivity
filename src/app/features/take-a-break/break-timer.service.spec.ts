import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { GlobalTrackingIntervalService } from '../../core/global-tracking-interval/global-tracking-interval.service';
import { Tick } from '../../core/global-tracking-interval/tick.model';
import { BreakTimerService } from './break-timer.service';

describe('BreakTimerService', () => {
  let service: BreakTimerService;
  let tick$: Subject<Tick>;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-07-11T12:00:00Z'));
    tick$ = new Subject<Tick>();

    TestBed.configureTestingModule({
      providers: [
        BreakTimerService,
        { provide: GlobalTrackingIntervalService, useValue: { tick$ } },
      ],
    });

    service = TestBed.inject(BreakTimerService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('tracks elapsed, remaining, and progress from wall-clock timestamps', () => {
    service.start(5 * 60 * 1000);

    tick$.next({
      duration: 60 * 1000,
      date: '2026-07-11',
      timestamp: Date.now() + 60000,
    });

    expect(service.isActive()).toBeTrue();
    expect(service.elapsed()).toBe(60 * 1000);
    expect(service.remaining()).toBe(4 * 60 * 1000);
    expect(service.progress()).toBe(20);
    expect(service.isTargetReached()).toBeFalse();
  });

  it('keeps measuring after the target duration is reached', () => {
    service.start(5 * 60 * 1000);

    tick$.next({
      duration: 6 * 60 * 1000,
      date: '2026-07-11',
      timestamp: Date.now() + 360000,
    });

    expect(service.elapsed()).toBe(6 * 60 * 1000);
    expect(service.remaining()).toBe(0);
    expect(service.progress()).toBe(100);
    expect(service.isTargetReached()).toBeTrue();
  });

  it('returns the actual elapsed duration when stopped', () => {
    service.start(5 * 60 * 1000);
    jasmine.clock().tick(2 * 60 * 1000);

    expect(service.stop()).toBe(2 * 60 * 1000);
    expect(service.isActive()).toBeFalse();
    expect(service.elapsed()).toBe(0);
  });
});
