#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ignoreDir = new Set(['node_modules', '.git', 'android', 'ios']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (ignoreDir.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const files = walk(root);
const fileSet = new Set(files);

function resolveFrom(fromFile, spec) {
  const tryBase = (base) => {
    const candidates = [
      ...Array.from(exts).map((ext) => `${base}${ext}`),
      ...Array.from(exts).map((ext) => path.join(base, `index${ext}`)),
      base,
    ];
    return candidates.find((candidate) => fileSet.has(candidate)) || null;
  };

  if (spec.startsWith('.')) return tryBase(path.resolve(path.dirname(fromFile), spec));
  if (spec.startsWith('src/')) return tryBase(path.join(root, spec));
  if (spec.startsWith('utils/')) return tryBase(path.join(root, spec));
  return null;
}

const importRe = /(?:import|export)\s+(?:[^'"`]*?from\s*)?["'`]([^"'`]+)["'`]/g;
const dynamicImportRe = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const requireRe = /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

const inbound = new Map(files.map((file) => [file, 0]));

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const refs = new Set();

  for (const regex of [importRe, dynamicImportRe, requireRe]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content))) {
      const resolved = resolveFrom(file, match[1]);
      if (resolved) refs.add(resolved);
    }
  }

  for (const resolved of refs) {
    inbound.set(resolved, (inbound.get(resolved) || 0) + 1);
  }
}

const roots = new Set();
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (rel === 'App.tsx' || rel === 'index.js') roots.add(file);
  if (rel.startsWith('src/app/')) roots.add(file);
}

const srcFiles = files.filter((file) => path.relative(root, file).replace(/\\/g, '/').startsWith('src/'));

const candidates = srcFiles
  .filter((file) => (inbound.get(file) || 0) === 0 && !roots.has(file))
  .map((file) => path.relative(root, file).replace(/\\/g, '/'))
  .sort();

const holdPrefixes = ['src/components/ui/', 'src/app/'];
const holdFiles = [
  'src/hooks/use-mobile.ts',
  'src/hooks/use-toast.ts',
  'src/lib/db.ts',
  'src/lib/utils.ts',
  'src/types/expo-linear-gradient.d.ts',
  'src/screens/AlertsScreen.tsx',
  'src/screens/MapScreen.tsx',
];

const hold = candidates.filter(
  (file) => holdPrefixes.some((prefix) => file.startsWith(prefix)) || holdFiles.includes(file)
);
const cleanup = candidates.filter((file) => !hold.includes(file));

const result = {
  scannedAt: new Date().toISOString(),
  totalSourceFiles: srcFiles.length,
  potentialUnreferenced: candidates,
  cleanup,
  hold,
};

console.log(JSON.stringify(result, null, 2));
