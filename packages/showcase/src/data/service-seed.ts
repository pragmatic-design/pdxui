// The services the desk sells, and who subscribes to what, as the server starts with them.
//
// In its own module, with no imports but a type, for the reason `asset-seed.ts` gives: the customers
// store seeds its subscriptions from here, and it must not carry the services store to do it.
//
// Arithmetic, so a spec derives every number from these lines:
// - six services; the sixth, «On-site legacy», is no longer sold (inactive);
// - customer c subscribes to service (c % 5) + 1; to ((c + 2) % 5) + 1 as well when c is even; and
//   to 6 when c is a multiple of three. One to three each, never the same one twice;
// - every subscription started on the first of a month in 2025 and has not ended.
import type { AssetKind } from './asset-seed';

export interface ServiceRecord extends Record<string, unknown> {
    id: number;
    code: string;
    name: string;
    description: string;
    /** Hours to the first answer. */
    slaHours: number;
    /** Hours to the resolution. */
    resolveHours: number;
    /** Monthly, in euro. */
    price: number;
    /** Still sold: an inactive service keeps its subscribers and is offered to no one new. */
    active: boolean;
    /** The kinds of asset it covers. Service desk covers them all. */
    covers: AssetKind[];
}

export interface Subscription {
    serviceId: number;
    since: string;
    /** The day it ended; empty while it runs. Ended, never deleted. */
    until: string;
}

const EVERY_KIND: AssetKind[] = ['printer', 'scanner', 'laptop', 'network', 'phone'];

/** A fresh copy every call: the store owns and mutates its own. */
export function serviceSeed(): ServiceRecord[] {
    return [
        { id: 1, code: 'SVC-PRN', name: 'Printer care', description: 'Printers and scanners: toner, jams, pairing, on-site swap.', slaHours: 4, resolveHours: 24, price: 120, active: true, covers: ['printer', 'scanner'] },
        { id: 2, code: 'SVC-NET', name: 'Network support', description: 'Wi-Fi, switches and the VPN, watched and answered first.', slaHours: 2, resolveHours: 8, price: 350, active: true, covers: ['network'] },
        { id: 3, code: 'SVC-LPT', name: 'Laptop care', description: 'Laptops: repairs, a loan machine, a new starter set up.', slaHours: 8, resolveHours: 48, price: 90, active: true, covers: ['laptop'] },
        { id: 4, code: 'SVC-PHN', name: 'Telephony', description: 'Desk phones and the switchboard.', slaHours: 8, resolveHours: 24, price: 60, active: true, covers: ['phone'] },
        { id: 5, code: 'SVC-DSK', name: 'Service desk', description: 'One number for everything, answered in business hours.', slaHours: 12, resolveHours: 72, price: 200, active: true, covers: [...EVERY_KIND] },
        { id: 6, code: 'SVC-LEG', name: 'On-site legacy', description: 'The visit-only contract, no longer sold.', slaHours: 24, resolveHours: 96, price: 150, active: false, covers: ['printer', 'laptop'] },
    ];
}

/** Customer `c`'s subscriptions in the seed. */
export function seedSubscriptions(c: number): Subscription[] {
    const ids = [(c % 5) + 1, ...(c % 2 === 0 ? [((c + 2) % 5) + 1] : []), ...(c % 3 === 0 ? [6] : [])];
    return ids.map((serviceId, n) => ({
        serviceId,
        since: `2025-${String(1 + ((c + n) % 12)).padStart(2, '0')}-01`,
        until: '',
    }));
}

/** Whether a subscription runs on `day` (ISO): started, and not yet ended. */
export function isCurrent(s: Subscription, day: string): boolean {
    return s.since <= day && (s.until === '' || s.until > day);
}
