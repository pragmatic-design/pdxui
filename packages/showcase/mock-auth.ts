/**
 * The identity endpoints, as a Vite plugin.
 *
 * A real login, not a fake dropdown — and a mock that hands out `{ token: 'abc' }` is that
 * dropdown with extra steps. So this issues a
 * **real JWT**: three base64url segments, HS256, signed with a key generated when the process
 * starts. The browser never sees the key — `createAuthStore` decodes the payload like it would
 * decode any token from any identity provider, and the expiry timer is armed from a real `exp`.
 *
 * It also VERIFIES. Every protected endpoint recomputes the signature and refuses a token that has
 * been edited, and checks the permission the action needs. That is what makes the difference
 * between hiding and forbidding visible on the screen: the technician does not see the button, and
 * the page offers a second one that calls the endpoint anyway — the server says 403 either way.
 *
 * Served in `dev` and in `preview`, because the suite runs against the production build.
 *
 * State lives in the process and is reset per run. It is a mock, and it says so.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ACCOUNTS, type Account } from './src/data/users';
import { PERMISSIONS, seedRoles, type Role } from './src/data/roles-seed';

/** An account, and what signs it in. The accounts are shared with Settings › Users. */
interface MockUser extends Account {
    password: string;
}

/** Only here: the account list is in the browser's bundle, a password must not be. */
const PASSWORDS: Record<string, string> = { admin: 'pdx', tech: 'pdx' };

/**
 * What each role may do, and who holds which — on the SERVER, and the server's to change.
 * The client starts from the same seed and reads this back: its copy decides what is
 * rendered, this one decides what happens. A showcase where the button is the only check teaches
 * the half of the job that is not security. Per process, reset per run, as the rest of the mock.
 */
interface AccessState {
    roles: Role[];
    users: MockUser[];
}

function seedAccess(): AccessState {
    return {
        roles: seedRoles(),
        users: ACCOUNTS.map((a) => ({ ...a, roles: [...a.roles], password: PASSWORDS[a.username] })),
    };
}

/**
 * Why an access state is refused, or null. Two rules, both the server's:
 *   · a role is deactivated only once no account holds it — the refusal names who does;
 *   · somebody must still be able to change permissions: an active role granting
 *     `settings.permissions`, held by at least one account. Otherwise nobody could ever undo it.
 */
function refusal(state: AccessState): string | null {
    for (const role of state.roles) {
        if (role.active) continue;
        const holders = state.users.filter((u) => u.roles.includes(role.key)).map((u) => u.name);
        if (holders.length) return `«${role.name}» is held by ${holders.join(', ')}: take it away from them first.`;
    }
    const managers = state.roles.filter((r) => r.active && r.permissions.includes('settings.permissions')).map((r) => r.key);
    if (!state.users.some((u) => u.roles.some((r) => managers.includes(r)))) {
        return 'Somebody has to be able to change permissions: at least one account must keep settings.permissions.';
    }
    return null;
}

/** Per process, never sent anywhere. A throwaway key is still a key: the signature is verified. */
const SECRET = randomBytes(32);

/** How long the login takes to answer. Long enough that a pending state is a state. */
const LOGIN_LATENCY_MS = 350;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const b64url = (input: Buffer | string): string =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(payload: Record<string, unknown>): string {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify(payload));
    const signature = b64url(createHmac('sha256', SECRET).update(`${header}.${body}`).digest());
    return `${header}.${body}.${signature}`;
}

/**
 * The claims of a token this server signed, or null.
 *
 * `timingSafeEqual` over a recomputed signature: the point of a mock that verifies is that it
 * verifies, and a comparison that returns early on the first wrong byte is the one bug everybody
 * writes here. A length mismatch is rejected before the compare, which `timingSafeEqual` requires.
 */
function verify(token: string | null): Record<string, unknown> | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const expected = Buffer.from(b64url(createHmac('sha256', SECRET)
        .update(`${parts[0]}.${parts[1]}`).digest()));
    const actual = Buffer.from(parts[2]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
        const claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'),
            'base64').toString('utf8')) as { exp?: number };
        if (typeof claims.exp === 'number' && Date.now() >= claims.exp * 1000) return null;
        return claims as Record<string, unknown>;
    } catch {
        return null;
    }
}

function json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
    } catch {
        return {};
    }
}

const bearer = (req: IncomingMessage): string | null => {
    const header = req.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : null;
};

function createHandler() {
    /** Every action the server has allowed, so the page can show that it really happened. */
    let closedMonths = 0;
    let access = seedAccess();

    /** The permissions of a set of roles, as the server holds them NOW — not as the token was signed. */
    const permissionsOf = (roles: string[]): string[] =>
        [...new Set(access.roles.filter((r) => r.active && roles.includes(r.key)).flatMap((r) => r.permissions))].sort();
    const grantedTo = (roles: string[], permission: string): boolean => permissionsOf(roles).includes(permission);

    /** What Settings reads: the catalogue, the roles, and who holds which. Never a password. */
    const accessView = () => ({
        permissions: [...PERMISSIONS],
        roles: access.roles,
        accounts: access.users.map(({ username, name, email, roles }) => ({ username, name, email, roles })),
    });

    return async function handle(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname;
        if (!path.startsWith('/api/auth/') && !path.startsWith('/api/account/') && !path.startsWith('/api/admin/')) return next();

        // POST /api/auth/login — { username, password, ttl? } → a signed access token.
        if (req.method === 'POST' && path === '/api/auth/login') {
            const body = await readJson(req);
            await sleep(LOGIN_LATENCY_MS);
            // The roles as they are NOW: a change in Settings › Users is signed into the next token.
            const user = access.users.find((u) => u.username === String(body.username ?? '').trim().toLowerCase());
            if (!user || user.password !== String(body.password ?? '')) {
                // One message for both halves, on purpose: telling a caller WHICH half was wrong
                // is how an unauthenticated visitor enumerates accounts.
                json(res, 401, { error: 'Wrong username or password.' });
                return;
            }
            // `ttl` is how the expiry is demonstrated without waiting an hour. Clamped: a token
            // valid for a day is not something a query string should be able to ask for.
            const ttl = Math.min(Math.max(Number(body.ttl) || 3600, 1), 3600);
            const now = Math.floor(Date.now() / 1000);
            const token = sign({
                sub: user.username,
                name: user.name,
                email: user.email,
                // The shape `permissions.md` documents, so the showcase demonstrates the
                // documented `decodeUser` rather than a shape invented for it.
                realm_access: { roles: user.roles },
                iat: now,
                exp: now + ttl,
            });
            json(res, 200, { access: token, refresh: null, expiresIn: ttl });
            return;
        }

        // Everything below needs a token this server signed, and says so the same way.
        const claims = verify(bearer(req));
        if (!claims) {
            json(res, 401, { error: 'No valid session. Sign in again.' });
            return;
        }
        const roles = ((claims.realm_access as { roles?: string[] } | undefined)?.roles) ?? [];

        // GET /api/account/me — the SERVER's view of who is calling, so the page can show that the
        // token it holds is the token the backend accepts.
        if (req.method === 'GET' && path === '/api/account/me') {
            json(res, 200, { sub: claims.sub, name: claims.name, roles, permissions: permissionsOf(roles), closedMonths });
            return;
        }

        // ── Settings › Permissions and Users ──
        // Read by anyone signed in (the matrix is read-only for them); changed only with
        // `settings.permissions`, checked here whatever the page shows.
        if (req.method === 'GET' && path === '/api/admin/access') {
            json(res, 200, accessView());
            return;
        }
        if (req.method === 'PUT' && (path === '/api/admin/roles' || path.startsWith('/api/admin/accounts/'))) {
            if (!grantedTo(roles, 'settings.permissions')) {
                json(res, 403, { error: 'Changing permissions needs settings.permissions, which this account does not have.' });
                return;
            }
            const body = await readJson(req);
            const next: AccessState = { roles: access.roles, users: access.users };
            if (path === '/api/admin/roles') {
                const incoming = Array.isArray(body.roles) ? body.roles as Role[] : [];
                const keys = new Set<string>();
                next.roles = incoming.map((r) => ({
                    key: String(r.key), name: String(r.name ?? r.key).trim() || String(r.key), active: r.active !== false,
                    permissions: [...new Set((r.permissions ?? []).map(String))].filter((p) => (PERMISSIONS as readonly string[]).includes(p)),
                }));
                for (const r of next.roles) {
                    if (!r.key || keys.has(r.key)) { json(res, 409, { error: `Two roles are called «${r.key}».` }); return; }
                    keys.add(r.key);
                }
            } else {
                const username = decodeURIComponent(path.slice('/api/admin/accounts/'.length));
                const wanted = Array.isArray(body.roles) ? (body.roles as unknown[]).map(String) : [];
                const unknown = wanted.filter((k) => !access.roles.some((r) => r.key === k && r.active));
                if (unknown.length) { json(res, 409, { error: `No active role «${unknown[0]}».` }); return; }
                if (!access.users.some((u) => u.username === username)) { json(res, 404, { error: `No account «${username}».` }); return; }
                next.users = access.users.map((u) => (u.username === username ? { ...u, roles: wanted } : u));
            }
            const why = refusal(next);
            if (why) { json(res, 409, { error: why }); return; }
            access = next;
            json(res, 200, accessView());
            return;
        }

        // POST /api/account/close-month — the action a technician does not see AND may not take.
        if (req.method === 'POST' && path === '/api/account/close-month') {
            if (!grantedTo(roles, 'billing.write')) {
                json(res, 403, { error: 'Closing the month needs billing.write, which this account does not have.' });
                return;
            }
            closedMonths += 1;
            json(res, 200, { ok: true, closedMonths });
            return;
        }

        json(res, 405, { error: `${req.method} ${path} is not an endpoint of this mock` });
    };
}

/** Serve `/api/auth`, `/api/account` and `/api/admin` in both `vite dev` and `vite preview`. */
export function mockAuth(): Plugin {
    const handle = createHandler();
    return {
        name: 'showcase-mock-auth',
        configureServer(server: ViteDevServer) {
            server.middlewares.use((req, res, next) => { void handle(req, res, next); });
        },
        configurePreviewServer(server: PreviewServer) {
            server.middlewares.use((req, res, next) => { void handle(req, res, next); });
        },
    };
}
