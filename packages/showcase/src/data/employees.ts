// The THIRD entity, the one with the reference's detail.
//
// The reference's employee: a person, their personal data, and — in their own sections — their
// contracts, their sites and their documents. What the store adds over
// `createMemoryStore` is a VERSION: the detail's identity and its sections read the same record, and
// an edit saved in one section has to reach the name at the top without a reload.
import { signal, type DataRequest } from '@pdxui/core';
import { createMemoryStore, type StoredRow } from './memory-store';

export interface Employee extends StoredRow {
    id: number;
    reference: string;
    firstName: string;
    lastName: string;
    email: string;
    /** ISO 3166 alpha-2. The tax code is asked for, and required, only for `IT`. */
    country: string;
    taxCode: string;
    /** The identity document: issued, and when it expires. The expiry follows the issue. */
    documentIssued: string;
    documentExpires: string;
    hired: string;
    // ── The rest of the personal data, grouped as its form is ──
    birthDate: string;
    /** 'female' | 'male' | 'other', or '' when not given. */
    gender: string;
    /** Digits only: the masked input keeps the unmasked value. */
    mobile: string;
    /** How they prefer to be reached: 'email' | 'phone' | 'sms'. */
    channel: string;
    street: string;
    city: string;
    postcode: string;
    /** 'idCard' | 'passport' | 'licence', or ''. */
    documentType: string;
    documentNumber: string;
    skills: string[];
    /** When their working day starts, HH:MM. */
    startTime: string;
    remote: boolean;
    /** English, 0 (not given) to 5. */
    english: number;
    notes: string;
    /** Privacy consent — required to save the personal data. Marketing is optional. */
    privacy: boolean;
    marketing: boolean;
    // ── The Details' tabs ──
    /** The language they are written to in: an ISO 639-1 code, or ''. */
    language: string;
    /** The residence's province, two letters (an Italian sigla), or ''. */
    province: string;
    birthCity: string;
    birthPostcode: string;
    birthProvince: string;
    /** ISO 3166 alpha-2, or ''. */
    birthCountry: string;
    phone: string;
    emergencyName: string;
    emergencyPhone: string;
    /** How they were hired: 'referral' | 'jobBoard' | 'agency' | 'website' | 'internal', or ''. */
    hireChannel: string;
    /** The contracts, one period each. Ended, never deleted. */
    contracts: Contract[];
    /** Where they work, and as what. Ended, never deleted. */
    assignments: Assignment[];
}

/** A site, a role there, and when it started. `end` is empty while it is current. */
export interface Assignment {
    id: number;
    siteId: number;
    /** The name as it was when assigned: the record reads without a second round trip. */
    siteName: string;
    role: string;
    start: string;
    end: string;
}

/** A period of employment. `end` is empty while the contract is open. */
export interface Contract {
    id: number;
    type: ContractType;
    start: string;
    end: string;
    weeklyHours: number;
}

export type ContractType = 'permanent' | 'fixedTerm' | 'apprenticeship';
export const CONTRACT_TYPES: ContractType[] = ['permanent', 'fixedTerm', 'apprenticeship'];

const PEOPLE: [string, string, string][] = [
    ['Ada', 'Rossi', 'IT'], ['Marie', 'Laurent', 'FR'], ['Lukas', 'Becker', 'DE'], ['Lucía', 'García', 'ES'],
    ['Giulia', 'Bianchi', 'IT'], ['Oliver', 'Smith', 'GB'], ['Chiara', 'Ferri', 'IT'], ['Hugo', 'Martin', 'FR'],
    ['Sofia', 'Colombo', 'IT'], ['Jonas', 'Weber', 'DE'], ['Elena', 'Ricci', 'IT'],
];

/** The Italian codice fiscale's shape, made up: 16 characters, what a form would receive. */
const taxCodeFor = (first: string, last: string, i: number): string =>
    (last.slice(0, 3) + first.slice(0, 3)).toUpperCase().padEnd(6, 'X') + `${80 + i}A0${1 + (i % 9)}H501Z`;

/** The rest of the personal data as nobody has filled it. */
const UNFILLED = {
    birthDate: '', gender: '', mobile: '', channel: '', street: '', city: '', postcode: '',
    documentType: '', documentNumber: '', skills: [] as string[], startTime: '', remote: false,
    english: 0, notes: '', privacy: false, marketing: false,
    language: '', province: '', birthCity: '', birthPostcode: '', birthProvince: '', birthCountry: '',
    phone: '', emergencyName: '', emergencyPhone: '', hireChannel: '',
};

export const HIRE_CHANNELS = ['referral', 'jobBoard', 'agency', 'website', 'internal'];

/** Where the seed has them live and come from: city, province, postcode, per country. */
const PLACES: Record<string, [string, string, string][]> = {
    IT: [['Verona', 'VR', '37121'], ['Milano', 'MI', '20121'], ['Torino', 'TO', '10121'], ['Bologna', 'BO', '40121'], ['Roma', 'RM', '00184']],
    DE: [['Berlin', '', '10115']],
};

/**
 * The Details' fields for every other employee of the seed — the even ones — so a filled record and
 * an empty one are both a click away. Each lives where their country says, and was born there.
 */
function seedDetails(last: string, country: string, i: number): Partial<Employee> {
    const places = PLACES[country];
    if (i % 2 !== 0 || !places) return {};
    const [city, province, postcode] = places[i % places.length];
    const [birthCity, birthProvince, birthPostcode] = places[(i + 1) % places.length];
    return {
        language: country === 'IT' ? 'it' : 'de',
        street: country === 'IT' ? `Via ${last} ${i + 3}` : `${last}straße ${i + 3}`,
        city, province, postcode,
        birthCity, birthProvince, birthPostcode, birthCountry: country,
        phone: `045 ${String(8000000 + i * 1379).slice(0, 7)}`,
        emergencyName: `Marco ${last}`,
        emergencyPhone: `+39 347 ${String(1000000 + i * 7919).slice(0, 7)}`,
        hireChannel: HIRE_CHANNELS[i % HIRE_CHANNELS.length],
    };
}

/** A new employee as a create leaves one: a name and nothing else. */
const blank = (id: number, firstName: string, lastName: string): Employee => ({
    id, reference: `E-${3000 + id}`, firstName, lastName,
    email: '', country: '', taxCode: '', documentIssued: '', documentExpires: '', hired: '',
    ...UNFILLED,
    contracts: [],
    assignments: [],
});

/** The seed's sites, by id, as `sites.ts` numbers them: the assignment's site is one of those. */
const SEED_SITES: [number, string][] = [[1, 'Verona Nord'], [3, 'Milano Centrale'], [5, 'Torino Lingotto'], [6, 'Bologna Fiera']];

/** One current assignment each, at a site of the seed. */
function seedAssignments(hired: string, i: number): Assignment[] {
    const [siteId, siteName] = SEED_SITES[i % SEED_SITES.length];
    return [{ id: 1, siteId, siteName, role: i % 2 === 0 ? 'Technician' : 'Coordinator', start: hired, end: '' }];
}

/** What the seed gives each employee: a first fixed-term period that ended, then an open one. */
function seedContracts(hired: string, i: number): Contract[] {
    const year = Number(hired.slice(0, 4));
    const endOfTrial = `${year + 1}${hired.slice(4)}`;
    // Elena Ricci's ends twelve days from TODAY, whenever the seed is built: «Ending this month»
    // has a row on any day, not only in the month the seed was written.
    const end = i === 10 ? new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10) : '';
    return [
        { id: 1, type: 'fixedTerm', start: hired, end: endOfTrial, weeklyHours: 40 },
        { id: 2, type: 'permanent', start: endOfTrial, end, weeklyHours: i % 3 === 0 ? 30 : 40 },
    ];
}

const store = createMemoryStore<Employee>({
    seed: () => [
        ...PEOPLE.map(([first, last, country], i) => ({
            id: i + 1,
            reference: `E-${3001 + i}`,
            firstName: first,
            lastName: last,
            email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`
                .normalize('NFD').replace(/[̀-ͯ]/g, ''),
            country,
            taxCode: country === 'IT' ? taxCodeFor(first, last, i) : '',
            documentIssued: `20${20 + (i % 5)}-0${1 + (i % 9)}-15`,
            documentExpires: `20${30 + (i % 5)}-0${1 + (i % 9)}-14`,
            hired: `20${15 + (i % 9)}-0${1 + (i % 9)}-01`,
            // The seed filled its personal data once, so it gave the consent that saving needs.
            ...UNFILLED,
            ...seedDetails(last, country, i),
            documentType: 'idCard',
            privacy: true,
            contracts: seedContracts(`20${15 + (i % 9)}-0${1 + (i % 9)}-01`, i),
            assignments: seedAssignments(`20${15 + (i % 9)}-0${1 + (i % 9)}-01`, i),
        })),
        // The seed's last one is what a create leaves, so the section's VOID state is on screen
        // without a test having to create one first.
        { ...blank(12, 'Nuovo', 'Assunto'), reference: 'E-3012' },
    ],

    create: (values, id) => ({
        ...blank(id, String(values.firstName ?? ''), String(values.lastName ?? '')),
        reference: `E-${3000 + id}`,
    }),

    refusal: 'The server refused: an employee is ended, not deleted.',
    bulkRefusal: 'The server refused this one: the employee has an open contract.',
});

/** Bumped on every write, so whatever reads a record through `employeeById` reads it again. */
const version = signal(0);

export const employeeTransport = {
    ...store.transport,
    async create(values: Partial<Employee>): Promise<Employee> {
        const row = await store.transport.create(values);
        version.set((v) => v + 1);
        return row;
    },
    async update(row: Employee): Promise<Employee> {
        const saved = await store.transport.update(row);
        version.set((v) => v + 1);
        return saved;
    },
};

/** One employee, reactively: a saved edit reaches every screen that shows them. */
export function employeeById(id: number): Employee | undefined {
    version();
    return store.byId(id);
}

export const resetEmployees = (): void => { store.reset(); version.set((v) => v + 1); };

/** Who works at a site now: an assignment there with no end. Reactive, as `employeeById` is. */
export function peopleAtSite(siteId: number): Employee[] {
    version();
    return store.all().filter((e) => e.assignments.some((a) => a.siteId === siteId && a.end === ''));
}

/** Where the list leaves its sort and filter for a record's pager. */
export const EMPLOYEE_WALK_KEY = 'showcase.employees.walk';

/**
 * The ids a record's pager walks: the list's order as the reader left it, or the list's default
 * order when the record was opened directly. Asked of the server as the list asks it, every page.
 */
export async function employeeWalk(): Promise<number[]> {
    const walk = JSON.parse(sessionStorage.getItem(EMPLOYEE_WALK_KEY) ?? '{}') as Partial<Pick<DataRequest, 'sort' | 'filter'>>;
    const res = await store.transport.read({ page: 1, pageSize: 0, sort: walk.sort ?? [], filter: walk.filter ?? [] });
    return res.data.map((e) => e.id);
}

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Whether the person is still employed: a contract with no end, or one ending today or later.
 * Otherwise the day the last one ended — «not active since» — or '' for a record with no contract.
 */
export function employmentStatus(e: Employee): { active: boolean; since: string } {
    const now = today();
    if (e.contracts.some((c) => c.end === '' || c.end >= now)) return { active: true, since: '' };
    const ends = e.contracts.map((c) => c.end).sort();
    const last = ends[ends.length - 1] ?? '';
    return { active: false, since: last };
}

/** A contract that ends within the next 30 days: the section needs a look. */
export function contractEndingSoon(e: Employee): boolean {
    const now = today();
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    return e.contracts.some((c) => c.end !== '' && c.end >= now && c.end <= soon);
}
