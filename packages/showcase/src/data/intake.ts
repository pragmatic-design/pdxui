// The intake screen's backend, in memory.
//
// Two things a wizard needs from a server and cannot fake:
//
//   - a customer list that is SEARCHED and PAGED, because `<pdx-relation-picker>` over a preloaded
//     array proves nothing that a `<select>` would not;
//   - a submit that can REFUSE, because "a failure in the second form does not leave the first
//     committed" is a claim about what happens when something goes wrong.
//
// `lastSubmission` is what the screen shows and the spec asserts: the whole payload, once, so the
// test reads what the server received rather than what the form displayed.

import { signal } from '@pdxui/core';
import type { DataRequest, DataResponse, FilterDescriptor, IDataTransport } from '@pdxui/core';
import { customerTransport as customerStore, type Customer } from './customers';

export type { Customer };

/**
 * The customers the intake picks from: the CUSTOMERS STORE, the one set the tickets and the assets
 * name by id. A list of the intake's own would name customers differently — «Contoso» where the
 * store has «Contoso Manufacturing» — and an intake customer would own no asset.
 *
 * Searched and paged by the store, the way a server does: the picker sends a filter and a page, and
 * gets one page and a total back. `page` and `pageSize` are what a `DataRequest` carries — reading
 * `request.skip` / `request.take`, fields the type does not have, renders every row under a pager
 * that says «1–5 of 14», and the package's `tsconfig.json` makes that a type error.
 */
export const customerTransport: IDataTransport<Customer> = {
    async read(request: DataRequest): Promise<DataResponse<Customer>> {
        const answer = await customerStore.read(request);
        // What the picker ASKED for, so a test can tell a filtered request from a client-side
        // slice of a page that was already downloaded. The same shape as
        // `__pdxLastMove` on the board: a fact the DOM does not show.
        const skip = (request.page - 1) * request.pageSize;
        globalThis.__pdxLastCustomerRequest = {
            filter: (request.filter ?? [])
                .filter((f): f is FilterDescriptor => 'field' in f)
                .map(f => ({ field: String(f.field), value: String(f.value ?? '') })),
            page: request.page,
            returned: Math.min(request.pageSize, Math.max(0, answer.total - skip)),
            total: answer.total,
        };
        return answer;
    },
};

/** What an intake submission looks like once both forms are aggregated. */
export interface IntakeSubmission {
    intake: Record<string, unknown>;
    billing: Record<string, unknown>;
}

const _last = signal<IntakeSubmission | null>(null);
/** The last payload the server accepted. Null until one is. */
export const lastSubmission = _last as unknown as () => IntakeSubmission | null;

let refuse = false;
/** Make the next submit fail at the SERVER, after validation has already passed. */
export function refuseNextSubmit(): void { refuse = true; }

export function resetIntake(): void {
    _last.set(null);
    refuse = false;
    (globalThis as unknown as { __pdxLastIntake?: IntakeSubmission | null }).__pdxLastIntake = null;
}

/**
 * Accept a submission, or refuse it.
 *
 * The refusal happens AFTER both forms validated, which is the case worth showing: a screen whose
 * only failure mode is a red field teaches the half of the job that the form library already does.
 */
export async function submitIntake(payload: IntakeSubmission): Promise<void> {
    if (refuse) {
        refuse = false;
        throw new Error('The scheduling service refused this intake: no engineer is free in that window.');
    }
    _last.set(payload);
    // The mock SERVER's record of what it received, where a test can read it whole. It is on the
    // global because that is what a mock backend is here: the thing outside the app that a spec
    // interrogates. The application never reads it.
    (globalThis as unknown as { __pdxLastIntake?: IntakeSubmission }).__pdxLastIntake = payload;
}
