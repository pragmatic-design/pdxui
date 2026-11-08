// What a build brings that a visitor would: the session the showcase's pages are generated with
// (#160). `pdx.config.ts` names this module as `ssg.setup`, and the server imports it before the
// app's entries — before `index.html`'s script, so before the shell and its first route.
//
// Every route but the sign-in is behind the session (`auth.ts`), so without one a build writes the
// sign-in and nothing else. The session is the admin's, the account the suite signs in as and the
// one the sign-in form suggests: a generated page shows what that account sees. A visitor with
// another session, or none, is handled at boot as on any first load — the page their session does not
// match is rendered again, and a guest is sent to the sign-in.
//
// The token is not signed. Nothing checks it: the browser's store decodes a token without verifying
// it, as it would any identity provider's, and a build makes no request to the mock server — which
// would refuse it. It has no `exp` either: a build is not a session that ends, and an expiry would
// arm a timer that holds the build's process open.
//
// The locale is not set here: on the server `initI18n` takes the default, there being no visitor to
// detect (core's `locale.ts`).

import { auth } from './auth';
import { ACCOUNTS } from './data/users';

const admin = ACCOUNTS.find((a) => a.username === 'admin');
if (!admin) throw new Error('ssg.ts: the build signs in as the admin, and data/users.ts has no admin');

/** A segment of a JWT: JSON, UTF-8, base64url. */
const segment = (value: unknown): string => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

auth.setTokens({
    access: [
        segment({ alg: 'none', typ: 'JWT' }),
        segment({ sub: admin.username, name: admin.name, email: admin.email, realm_access: { roles: admin.roles } }),
        '',
    ].join('.'),
});
