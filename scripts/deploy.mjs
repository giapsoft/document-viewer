import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

const publish = spawnSync('npx', ['gh-pages', '-d', 'dist'], { cwd: root, stdio: 'inherit', shell: true });
process.exit(publish.status ?? 1);
