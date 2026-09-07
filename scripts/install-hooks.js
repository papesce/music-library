import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const hook = `#!/bin/sh
# auto-installed by npm run prepare — runs fast static checks
echo "[pre-commit] typecheck + lint..."
npm run typecheck || exit 1
npm run lint || exit 1
`;

try {
  const gitHooks = join(process.cwd(), '.git', 'hooks');
  if (!existsSync(gitHooks)) { console.log('no .git/hooks, skip'); process.exit(0); }
  const dest = join(gitHooks, 'pre-commit');
  // don't overwrite custom hook
  if (existsSync(dest)) {
    const cur = readFileSync(dest, 'utf8');
    if (cur.includes('auto-installed by npm run prepare')) {
      writeFileSync(dest, hook); chmodSync(dest, 0o755); console.log('updated pre-commit hook');
    } else console.log('existing pre-commit hook preserved');
  } else {
    writeFileSync(dest, hook); chmodSync(dest, 0o755); console.log('installed pre-commit hook');
  }
} catch (e) { console.warn('install-hooks:', e.message); }
