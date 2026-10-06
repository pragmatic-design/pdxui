// A pdx.config.ts that exists but does not load stops the CLI, and says which file and why.
//
// A `loadConfig` that caught every error and returned `{}` would ignore a config with a syntax error
// or a broken import in silence: `pdx build` would succeed with the default root, routes and outDir,
// and with the plugins dropped. Nothing printed, and the build that came out would look like a build.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig, loadConfigOrExit, ConfigLoadError } from '../src/config/loader';
import { logger } from '../src/utils/logger';

let root: string;
beforeEach(() => {
    root = join(tmpdir(), `pdx-config-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(root, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const write = (content: string, name = 'pdx.config.ts') => writeFileSync(join(root, name), content);
/** The path as the loader names it: `pathe` resolves with forward slashes on Windows too. */
const configPath = () => join(root, 'pdx.config.ts').replace(/\\/g, '/');

describe('loadConfig', () => {
    it('no config file: the defaults, as before', async () => {
        await expect(loadConfig(root)).resolves.toEqual({});
    });

    it('a config that loads is returned', async () => {
        write("export default { root: 'app' };\n");
        await expect(loadConfig(root)).resolves.toEqual({ root: 'app' });
    });

    it('a syntax error rejects, naming the file and the error', async () => {
        write('export default {\n');
        const err = await loadConfig(root).then(() => null, (e: Error) => e);
        expect(err, 'a broken config was read as no config').toBeInstanceOf(ConfigLoadError);
        expect(err!.message).toContain(configPath());
        expect(err!.message, 'the underlying error is not in the message').toMatch(/ParseError|Unexpected|SyntaxError/);
    });

    it('a missing import rejects, naming the module', async () => {
        write("import './nowhere-at-all';\nexport default {};\n");
        const err = await loadConfig(root).then(() => null, (e: Error) => e);
        expect(err).toBeInstanceOf(ConfigLoadError);
        expect(err!.message).toMatch(/nowhere-at-all/);
    });

    it('an export that is not an object rejects', async () => {
        write('export default 42;\n');
        const err = await loadConfig(root).then(() => null, (e: Error) => e);
        expect(err).toBeInstanceOf(ConfigLoadError);
        expect(err!.message).toMatch(/object/i);
    });
});

describe('the commands take that path', () => {
    it('no command calls loadConfig directly: an unusable config would surface as a stack trace', () => {
        const dir = join(__dirname, '..', 'src', 'commands');
        const direct = readdirSync(dir)
            .filter((f) => f.endsWith('.ts'))
            .filter((f) => /\bloadConfig\s*\(/.test(readFileSync(join(dir, f), 'utf8')));
        expect(direct).toEqual([]);
    });
});

describe('loadConfigOrExit — the path the commands take', () => {
    it('stops the CLI with the diagnostic instead of building on the defaults', async () => {
        write('export default {\n');
        const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

        await loadConfigOrExit(root);

        expect(exit, 'the CLI carried on with the defaults').toHaveBeenCalledWith(1);
        expect(error).toHaveBeenCalled();
        expect(String(error.mock.calls[0][0])).toContain('pdx.config.ts');
        exit.mockRestore();
        error.mockRestore();
    });

    it('a config that loads comes through untouched, and nothing exits', async () => {
        write("export default { root: 'app' };\n");
        const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        await expect(loadConfigOrExit(root)).resolves.toEqual({ root: 'app' });
        expect(exit).not.toHaveBeenCalled();
        exit.mockRestore();
    });
});
