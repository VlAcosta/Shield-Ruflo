import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcRoot = path.join(root, 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

const tests = walk(srcRoot).filter((file) => /\.(test|spec)\.(js|jsx|ts|tsx)$/.test(file));

for (const file of tests) {
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('jest.requireActual')) {
    throw new Error(`Manual migration required for jest.requireActual in ${path.relative(root, file)}`);
  }
  if (!source.includes('jest.')) continue;
  source = source.replace(/\bjest\./g, 'vi.');
  fs.writeFileSync(file, source);
}

for (const [from, to] of [
  ['src/App.js', 'src/App.jsx'],
  ['src/App.test.js', 'src/App.test.jsx'],
]) {
  const fromPath = path.join(root, from);
  const toPath = path.join(root, to);
  if (fs.existsSync(fromPath) && !fs.existsSync(toPath)) fs.renameSync(fromPath, toPath);
}

const remaining = tests
  .filter((file) => fs.existsSync(file))
  .filter((file) => fs.readFileSync(file, 'utf8').includes('jest.'));

if (remaining.length) {
  throw new Error(`Unmigrated Jest usage: ${remaining.map((file) => path.relative(root, file)).join(', ')}`);
}
