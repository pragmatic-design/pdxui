// The tickets as the server starts with them: one set, read by the list and by the board.
//
// One set, so the two screens never show two data sets under one name. It lives in its own module, not in `tickets.ts`, so the board can read the records without
// taking the list's store — the store is a server, and the board has one of its own for moves.
//
// Named `seed`, not `ticket-seed`: it becomes a chunk of its own, and a chunk called `ticket-…` is,
// to `prefetch.spec.ts`, the ticket PAGE — the home page loads it and the row would read that as the
// route arriving before it was asked for.
import { assetIdFor, type AssetKind } from './asset-seed';
import { CUSTOMER_NAMES } from './customer-seed';

export interface TicketRecord extends Record<string, unknown> {
    id: number;
    reference: string;
    subject: string;
    /** The customer's name as it was when the ticket was opened — the record reads without a second round trip. */
    customer: string;
    /** The customer, `customer-seed.ts`'s id. 0 for a name typed with no record behind it. */
    customerId: number;
    priority: 'low' | 'normal' | 'high';
    status: 'open' | 'waiting' | 'closed';
    /** Who is on it. Empty is a real state — an unassigned ticket is the one a queue exists for. */
    assignee: string;
    opened: string;
    /** The site it was opened at, `sites.ts`'s id; 0 for a ticket raised from nowhere in particular. */
    siteId: number;
    /** What it was opened on, `asset-seed.ts`'s id; 0 when the subject names no thing. */
    assetId: number;
    /** Category codes, `categories.ts`'s. */
    categories: string[];
}

/** How many sites `sites.ts` seeds: the tickets that name one cycle through them. */
const SITE_COUNT = 14;

const SUBJECTS = [
    'Printer on floor 2 is jammed', 'VPN drops every twenty minutes', 'New starter needs a laptop',
    'Shared mailbox is read-only', 'Badge reader rejects the night shift', 'Invoice export ends at row 500',
    'Meeting room screen shows no signal', 'Password reset mail never arrives', 'Laptop fan runs constantly',
    'Two-factor codes arrive late', 'Warehouse scanner loses pairing', 'Payroll report is a day behind',
];
/**
 * The customers the tickets are opened for: the store's first five, by id — not strings of their
 * own, which drift from the store's names («Northwind» for «Northwind Traders»).
 */
const CUSTOMER_IDS = [1, 2, 3, 4, 5];
/**
 * The kind of thing each subject is about, by the subject's index, or nothing: a mailbox, an export,
 * a password and a report are not assets. Seven of twelve, so seven in twelve tickets name one.
 */
const SUBJECT_KIND: (AssetKind | null)[] = [
    'printer', 'network', 'laptop', null, 'scanner', null, null, null, 'laptop', 'phone', 'scanner', null,
];
/**
 * The categories each subject files under, by the subject's index. «Network» is the VPN
 * and the two-factor codes — subjects 1 and 9 — so the tickets 5, 9, 17, 21, 29 and 33 (T-1005,
 * T-1009, T-1017, T-1021, T-1029, T-1033), and no other.
 */
const SUBJECT_CATEGORIES: string[][] = [
    ['hardware'], ['network'], ['hardware'], ['software'], ['hardware', 'on-site'], ['billing', 'software'],
    ['hardware', 'on-site'], ['software'], ['hardware'], ['network', 'software'], ['hardware', 'on-site'], ['billing'],
];
// The people a ticket is handed to. The empty string is one of them on purpose: a list where
// everything is already assigned never shows what «Assign to» is for.
export const AGENTS = ['Ada Byron', 'Grace Hopper', 'Katherine Johnson'];
const ROSTER = ['', ...AGENTS];
// Each field cycles on its OWN step. On a shared index status and priority would split 12 / 12 /
// 12, every open ticket low and every waiting one normal, no open work high, and the queue would
// read «Printer on floor 2 is jammed» three times. A chart honest about that data makes it look fake.
//
// Still arithmetic, so a spec derives every number from these lines:
// - status: 12 steps, 5 open / 3 waiting / 4 closed → 15 open, 9 waiting, 12 closed of 36;
// - priority: 7 steps, a length that shares no factor with 12 — the open work is 7 normal, 4 high,
//   4 low, and all that is not closed is 10 normal, 6 high, 8 low;
// - assignee: nobody, then the three agents, shifted by one every fourth ticket, so the open tickets
//   with nobody on them are T-1000, T-1007 and T-1016 — ids 1, 8 and 17;
// - subject: `(i * 5) % 12`, 5 coprime with 12, so neighbours differ and the queue's three differ.
const STATUS_STEPS: TicketRecord['status'][] = [
    'open', 'waiting', 'closed', 'open', 'open', 'closed', 'waiting', 'open', 'closed', 'open', 'waiting', 'closed',
];
const PRIORITY_STEPS: TicketRecord['priority'][] = ['normal', 'high', 'normal', 'low', 'normal', 'high', 'low'];

/** Ticket `i`'s asset: its customer's thing of the kind its subject names — a «Printer…» ticket, its printer. */
function assetOf(i: number): number {
    const kind = SUBJECT_KIND[(i * 5) % SUBJECTS.length];
    return kind ? assetIdFor(CUSTOMER_IDS[i % CUSTOMER_IDS.length], kind) : 0;
}

/** A fresh copy every call: the store and the board each own and mutate theirs. */
export function ticketSeed(): TicketRecord[] {
    return Array.from({ length: 36 }, (_, i) => ({
        id: i + 1,
        reference: `T-${1000 + i}`,
        subject: SUBJECTS[(i * 5) % SUBJECTS.length],
        customer: CUSTOMER_NAMES[CUSTOMER_IDS[i % CUSTOMER_IDS.length] - 1],
        customerId: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
        priority: PRIORITY_STEPS[i % PRIORITY_STEPS.length],
        status: STATUS_STEPS[i % STATUS_STEPS.length],
        assignee: ROSTER[(i + Math.floor(i / 4)) % ROSTER.length],
        opened: new Date(Date.UTC(2026, 8, 1 + (i % 28))).toISOString().slice(0, 10),
        // Half of them, the even ones, each site in turn: site 1 has T-1000 and T-1028.
        siteId: i % 2 === 0 ? ((i / 2) % SITE_COUNT) + 1 : 0,
        assetId: assetOf(i),
        categories: [...SUBJECT_CATEGORIES[(i * 5) % SUBJECTS.length]],
    }));
}
