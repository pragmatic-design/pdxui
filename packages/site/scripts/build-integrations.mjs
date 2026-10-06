// Builds the framework integration demos (React/Vue/Angular) into
// packages/site/public/integrations/<fw>/ so the /integrations page can embed
// them as live iframes. Each demo installs @pdxui/* from the configured
// registry (see each app's .npmrc) and bundles them — the output is self-contained.
//
// Usage: node scripts/build-integrations.mjs   (or: npm run build:integrations)
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const integrations = join(root, 'integrations');
const outBase = join(here, '..', 'public', 'integrations');

for (const fw of ['react', 'vue', 'angular']) {
  const appDir = join(integrations, fw);
  if (!existsSync(join(appDir, 'node_modules'))) {
    console.log(`[integrations] installing ${fw}…`);
    execSync('npm install', { cwd: appDir, stdio: 'inherit' });
  }
  console.log(`[integrations] building ${fw}…`);
  execSync('npx vite build --base=./', { cwd: appDir, stdio: 'inherit' });
  const out = join(outBase, fw);
  rmSync(out, { recursive: true, force: true });
  cpSync(join(appDir, 'dist'), out, { recursive: true });
}
console.log('[integrations] done → public/integrations/{react,vue,angular}');
