// pdx-scheduler created inside someone else's effect — the site's props playground builds its live
// instance that way — must not make that effect depend on the scheduler's own signals. It did: the
// playground rebuilt the scheduler a hundred times and the runtime broke an infinite reactive loop.
import { describe, it, expect, afterEach } from 'vitest';
import { effect, signal } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/scheduler/pdx-scheduler.pdx';

afterEach(cleanup);

describe('pdx-scheduler mounted inside an effect', () => {
    it('runs that effect once', async () => {
        const stage = document.createElement('div');
        document.body.appendChild(stage);
        const ready = signal(true);
        let runs = 0;
        const dispose = effect(() => {
            if (!ready()) return;
            runs++;
            stage.innerHTML = '';
            const el = document.createElement('pdx-scheduler') as HTMLElement & Record<string, unknown>;
            el.setAttribute('view', 'week');
            stage.appendChild(el);
            // The playground then sets every control as a property, as an app would.
            Object.assign(el, { view: 'week', days: 3, agendaDays: 7, dayMaxEvents: 3, groupBy: 'resource', weekends: true, firstDay: -1, startHour: '00:00', endHour: '24:00', scrollTo: '08:00', slotMinutes: 30, nowIndicator: true });
        });
        await tick();
        await tick();
        dispose();
        expect(runs).toBe(1);
    });
});
