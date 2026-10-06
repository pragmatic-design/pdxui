// Is this a development build? The same probe as core's `isDevEnv` (packages/core/src/utils/env.ts),
// which core does not export. Bundlers replace the LITERAL `process.env.NODE_ENV`, so it is written
// exactly that way; read any other way it is false in every browser. A CDN build with no
// bundler has no `process`: the access throws, and that is not a dev build.
declare const process: { env: { NODE_ENV?: string } };

export function isDevEnv(): boolean {
    try {
        return process.env.NODE_ENV !== 'production';
    } catch {
        return false;
    }
}
