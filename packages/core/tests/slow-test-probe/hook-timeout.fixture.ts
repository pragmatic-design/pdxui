// Planted for slow-test-record.test.ts (#1183): a beforeAll that runs past its timeout. Not part of
// any suite — its config, vitest.config.ts beside it, is run by that test alone.
import { beforeAll, it } from 'vitest';
import { setTimeout as sleep } from 'node:timers/promises';

beforeAll(async () => {
    await sleep(4000);
}, 2500);

it('never runs: its beforeAll timed out', () => {});
