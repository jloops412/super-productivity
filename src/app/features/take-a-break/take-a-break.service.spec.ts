import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { Action } from '@ngrx/store';
import { TakeABreakService } from './take-a-break.service';
import { idleDialogResult } from '../idle/store/idle.actions';
import { IdleTrackItem } from '../idle/dialog-idle/dialog-idle.model';
import { TaskService } from '../tasks/task.service';
import { GlobalTrackingIntervalService } from '../../core/global-tracking-interval/global-tracking-interval.service';
import { IdleService } from '../idle/idle.service';
import { GlobalConfigService } from '../config/global-config.service';
import { NotifyService } from '../../core/notify/notify.service';
import { BannerService } from '../../core/banner/banner.service';
import { ChromeExtensionInterfaceService } from '../../core/chrome-extension-interface/chrome-extension-interface.service';
import { UiHelperService } from '../ui-helper/ui-helper.service';
import { LOCAL_ACTIONS } from '../../util/local-actions.token';
import { BannerId } from '../../core/banner/banner.model';
import { T } from '../../t.const';
import { WorkContextService } from '../work-context/work-context.service';
import { Tick } from '../../core/global-tracking-interval/tick.model';

describe('TakeABreakService', () => {
  let service: TakeABreakService;
  let taskService: jasmine.SpyObj<TaskService>;
  let bannerService: jasmine.SpyObj<BannerService>;
  let workContextService: jasmine.SpyObj<WorkContextService>;
  let notifyService: jasmine.SpyObj<NotifyService>;
  let actions$: Subject<Action>;
  let currentTaskId$: BehaviorSubject<string | null>;
  let tick$: Subject<Tick>;

  beforeEach(() => {
    actions$ = new Subject<Action>();
    currentTaskId$ = new BehaviorSubject<string | null>(null);
    tick$ = new Subject<Tick>();
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-07-11T12:00:00Z'));
    taskService = jasmine.createSpyObj<TaskService>('TaskService', [
      'pauseCurrent',
      'currentTaskId',
    ]);
    // `currentTaskId$` is read as a property during construction.
    (taskService as unknown as { currentTaskId$: unknown }).currentTaskId$ =
      currentTaskId$;
    taskService.currentTaskId.and.returnValue(null);

    bannerService = jasmine.createSpyObj<BannerService>('BannerService', [
      'open',
      'dismiss',
    ]);
    workContextService = jasmine.createSpyObj<WorkContextService>('WorkContextService', [
      'addToBreakTimeForActiveContext',
    ]);
    workContextService.addToBreakTimeForActiveContext.and.resolveTo();
    notifyService = jasmine.createSpyObj<NotifyService>('NotifyService', ['notify']);

    TestBed.configureTestingModule({
      providers: [
        TakeABreakService,
        { provide: TaskService, useValue: taskService },
        { provide: BannerService, useValue: bannerService },
        { provide: WorkContextService, useValue: workContextService },
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: GlobalTrackingIntervalService, useValue: { tick$ } },
        { provide: IdleService, useValue: { isIdle$: of(false) } },
        {
          provide: GlobalConfigService,
          useValue: {
            cfg$: of({ takeABreak: { isTakeABreakEnabled: true } }),
            takeABreak$: of({ isTakeABreakEnabled: true }),
            takeABreak: () => ({
              isTakeABreakEnabled: true,
              takeABreakSnoozeTime: 5 * 60 * 1000,
            }),
            idle$: of({ isEnableIdleTimeTracking: false }),
            sound$: of({ breakReminderSound: null, volume: 0 }),
          },
        },
        { provide: NotifyService, useValue: notifyService },
        { provide: ChromeExtensionInterfaceService, useValue: { isReady$: of(false) } },
        {
          provide: UiHelperService,
          useValue: { focusAppAfterNotification: () => undefined },
        },
      ],
    });

    service = TestBed.inject(TakeABreakService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  describe('idle dialog result', () => {
    const BREAK_ITEM: IdleTrackItem = {
      type: 'BREAK',
      time: 'IDLE_TIME',
      simpleCounterToggleBtns: [],
    };
    const TASK_ITEM: IdleTrackItem = {
      type: 'TASK',
      time: 60000,
      title: 'Some task',
      simpleCounterToggleBtns: [],
    };

    const dialogResult = (
      trackItems: IdleTrackItem[],
      isResetBreakTimer: boolean,
    ): Action =>
      idleDialogResult({
        trackItems,
        isResetBreakTimer,
        wasFocusSessionRunning: false,
        idleTime: 5 * 60000,
      });

    let emitted: number[];
    let sub: { unsubscribe: () => void };
    const current = (): number | undefined => emitted[emitted.length - 1];

    beforeEach(() => {
      emitted = [];
      sub = service.timeWorkingWithoutABreak$.subscribe((v) => emitted.push(v));
      // seed the working-without-a-break accumulator
      service.otherNoBreakTIme$.next(10000);
      expect(current()).toBe(10000);
    });

    afterEach(() => sub.unsubscribe());

    it('resets the timer when a reset was requested', () => {
      actions$.next(dialogResult([], true));
      expect(current()).toBe(0);
    });

    it('does not reset the timer when skipping without a reset request', () => {
      actions$.next(dialogResult([], false));
      expect(current()).toBe(10000);
    });

    it('does not reset the timer for a tracked break when the user opted out', () => {
      actions$.next(dialogResult([BREAK_ITEM], false));
      expect(current()).toBe(10000);
    });

    it('adds tracked task time but not break time when not resetting', () => {
      actions$.next(dialogResult([BREAK_ITEM, TASK_ITEM], false));
      expect(current()).toBe(10000 + 60000);
    });
  });

  describe('startBreak()', () => {
    it('pauses tracking', () => {
      service.startBreak();
      expect(taskService.pauseCurrent).toHaveBeenCalledTimes(1);
    });

    it('shows a timed break banner', () => {
      service.startBreak();

      expect(bannerService.open).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: BannerId.TakeABreak,
          msg: T.F.FOCUS_MODE.B.BREAK_RUNNING,
          isHideDismissBtn: true,
          timer$: jasmine.anything(),
          progress$: jasmine.anything(),
        }),
      );
    });

    it('dismisses the reminder banner', () => {
      service.startBreak();
      expect(bannerService.dismiss).toHaveBeenCalledTimes(1);
      expect(bannerService.dismiss).toHaveBeenCalledWith(BannerId.TakeABreak);
    });

    it('records the actual elapsed duration when the break ends', () => {
      service.startBreak();
      jasmine.clock().tick(2 * 60 * 1000);

      service.endBreak();

      expect(workContextService.addToBreakTimeForActiveContext).toHaveBeenCalledWith(
        undefined,
        2 * 60 * 1000,
      );
      expect(service.isBreakActive()).toBeFalse();
    });

    it('dismisses the active banner even when the break ends immediately', () => {
      service.startBreak();
      bannerService.dismiss.calls.reset();

      service.endBreak();

      expect(bannerService.dismiss).toHaveBeenCalledOnceWith(BannerId.TakeABreak);
      expect(workContextService.addToBreakTimeForActiveContext).not.toHaveBeenCalled();
      expect(service.isBreakActive()).toBeFalse();
    });

    it('ends the break when task tracking resumes', () => {
      service.startBreak();
      jasmine.clock().tick(60 * 1000);

      currentTaskId$.next('task-1');

      expect(workContextService.addToBreakTimeForActiveContext).toHaveBeenCalledWith(
        undefined,
        60 * 1000,
      );
      expect(service.isBreakActive()).toBeFalse();
    });

    it('updates the banner and notifies when the target duration is reached', () => {
      service.startBreak();
      bannerService.open.calls.reset();

      tick$.next({
        duration: 5 * 60 * 1000,
        date: '2026-07-11',
        timestamp: Date.now() + 300000,
      });

      expect(bannerService.open).toHaveBeenCalledWith(
        jasmine.objectContaining({ msg: T.F.POMODORO.BREAK_IS_DONE }),
      );
      expect(notifyService.notify).toHaveBeenCalledWith(
        jasmine.objectContaining({ title: T.F.POMODORO.BREAK_IS_DONE }),
      );
      expect(service.isBreakActive()).toBeTrue();
    });
  });
});
