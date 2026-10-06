// Resolve THIS module's directory in both shipped builds.
// The compiler ships dual-format: dist/index.cjs (CJS, has __dirname) and dist/index.js (ESM,
// has import.meta.url instead). `__dirname` referenced directly in the ESM bundle throws
// "ReferenceError: __dirname is not defined" the moment an external app loads it. `typeof` on an
// undeclared identifier is safe (never throws) in either module system, so each build takes the
// branch whose global actually exists.
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// __dirname is a CJS module-local (not a real global), present only in the CJS build. Declaring it
// module-scoped as possibly-undefined lets BOTH builds type-check with no ts-suppress directive —
// and `typeof` on it never throws in the ESM build where it's absent.
declare const __dirname: string | undefined;

export function moduleDir(): string {
    if (typeof __dirname !== 'undefined') return __dirname;
    return dirname(fileURLToPath(import.meta.url));
}
