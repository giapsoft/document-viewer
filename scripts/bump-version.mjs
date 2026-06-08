/**
 * Bump app semver in package.json (+ package-lock.json).
 *
 * Usage:
 *   npm run bump          # patch: 0.3.2 → 0.3.3
 *   npm run bump:minor    # minor: 0.3.2 → 0.4.0
 *   npm run bump:major    # major: 0.3.2 → 1.0.0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bumpType = (process.argv[2] ?? 'patch').toLowerCase();

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`Unknown bump type "${bumpType}". Use patch, minor, or major.`);
  process.exit(1);
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semver in package.json: "${version}"`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function nextVersion(current, type) {
  const parts = parseVersion(current);
  if (type === 'major') return `${parts.major + 1}.0.0`;
  if (type === 'minor') return `${parts.major}.${parts.minor + 1}.0`;
  return `${parts.major}.${parts.minor}.${parts.patch + 1}`;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const oldVersion = pkg.version;
const newVersion = nextVersion(oldVersion, bumpType);

pkg.version = newVersion;
writeJson(pkgPath, pkg);

if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
  lock.version = newVersion;
  if (lock.packages?.['']) {
    lock.packages[''].version = newVersion;
  }
  writeJson(lockPath, lock);
}

console.log(`Version bumped (${bumpType}): ${oldVersion} → ${newVersion}`);
console.log('Next: git add package.json package-lock.json && git commit && git push');
