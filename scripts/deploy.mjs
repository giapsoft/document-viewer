import { spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const distDir = join(root, 'dist');

process.env.VITE_APP_BASE = '/document-viewer';

const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

copyFileSync(join(distDir, 'index.html'), join(distDir, '404.html'));

const publish = spawnSync('npx', ['gh-pages', '-d', 'dist'], { cwd: root, stdio: 'inherit', shell: true });
process.exit(publish.status ?? 1);
