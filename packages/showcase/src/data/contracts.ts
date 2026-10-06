// Every employee's contracts, as one list.
//
// A READ model: the contracts live in each employee and are changed there. This answers
// «what ends this month» without opening twelve people — flattened, with a `state` a server would
// derive, and paged, sorted and filtered like any other store so the grid treats it as a list.
import type { DataRequest, DataResponse } from '@pdxui/core';
import { createMemoryStore, type StoredRow } from './memory-store';
import { employeeTransport, type ContractType } from './employees';

export type ContractState = 'open' | 'endingSoon' | 'ended';
export const CONTRACT_STATES: ContractState[] = ['open', 'endingSoon', 'ended'];

export interface ContractRow extends StoredRow {
    /** `employeeId * 100 + contract.id`: unique across people, whose own ids restart at 1. */
    id: number;
    employeeId: number;
    employeeName: string;
    type: ContractType;
    start: string;
    end: string;
    weeklyHours: number;
    state: ContractState;
}

const DAY = 86_400_000;

/** `contractEndingSoon`'s rule, per contract: ended before today, ending within 30 days, or open. */
export function contractState(end: string, now = new Date()): ContractState {
    if (end === '') return 'open';
    const today = now.toISOString().slice(0, 10);
    const soon = new Date(now.getTime() + 30 * DAY).toISOString().slice(0, 10);
    if (end < today) return 'ended';
    return end <= soon ? 'endingSoon' : 'open';
}

export const contractTransport = {
    /**
     * Read the employees as they are NOW, flatten, then answer the request the way the stores do —
     * through a memory store built for this read, so filtering, sorting and paging are the same code
     * every list's server runs, not a second copy of it.
     */
    async read(request: DataRequest): Promise<DataResponse<ContractRow>> {
        const people = await employeeTransport.read({ page: 1, pageSize: 0, sort: [], filter: [] });
        const rows: ContractRow[] = people.data.flatMap((e) => e.contracts.map((c) => ({
            id: e.id * 100 + c.id,
            employeeId: e.id,
            employeeName: `${e.firstName} ${e.lastName}`,
            type: c.type,
            start: c.start,
            end: c.end,
            weeklyHours: c.weeklyHours,
            state: contractState(c.end),
        })));
        const view = createMemoryStore<ContractRow>({
            seed: () => rows,
            create: (values, id) => ({ ...(values as ContractRow), id }),
            refusal: 'A contract is changed in its employee.',
            bulkRefusal: 'A contract is changed in its employee.',
        });
        return view.transport.read(request);
    },
};
