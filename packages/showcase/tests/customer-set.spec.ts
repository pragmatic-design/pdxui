/**
 * One set of customers, by id.
 *
 * The tickets' seed, the customers store and the intake name the same customers, by id: with a set
 * of its own each, a ticket cannot reach its customer's record, and an asset is matched to a
 * customer by a piece of its name. Read from the seeds themselves: a guard, not a page.
 */
import { test, expect } from '@playwright/test';
import { ticketSeed } from '../src/data/seed';
import { CUSTOMER_NAMES } from '../src/data/customer-seed';

test('the customers seed has no name twice', () => {
    expect(CUSTOMER_NAMES.length, 'the premise: the store seeds twenty-four').toBe(24);
    const twice = CUSTOMER_NAMES.filter((n, i) => CUSTOMER_NAMES.indexOf(n) !== i);
    expect(twice).toEqual([]);
});

test('every seed ticket names its customer by id, and by that customer\'s own name', () => {
    const wrong = ticketSeed()
        .filter((t) => !(t.customerId >= 1 && t.customerId <= CUSTOMER_NAMES.length && t.customer === CUSTOMER_NAMES[t.customerId - 1]))
        .map((t) => `${t.reference}: ${t.customerId} / ${t.customer}`);
    expect(wrong).toEqual([]);
});
