const fs = require('fs');
const path = require('path');

const packages = ['expo-modules-core', 'expo-dev-menu'];
const root = process.cwd();
const nodeModules = path.join(root, 'node_modules');
const extraPaths = [
  nodeModules,
  path.join(nodeModules, 'expo', 'node_modules'),
  path.join(nodeModules, 'expo-dev-client', 'node_modules'),
];

const findInPnpm = (pkg) => {
  const pnpmDir = path.join(nodeModules, '.pnpm');
  if (!fs.existsSync(pnpmDir)) return null;
  const entries = fs.readdirSync(pnpmDir).filter((e) => e.includes(`${pkg}@`));
  for (const entry of entries) {
    const candidate = path.join(pnpmDir, entry, 'node_modules', pkg);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return null;
};

for (const pkg of packages) {
  try {
    let resolvedDir;
    try {
      resolvedDir = path.dirname(require.resolve(`${pkg}/package.json`, { paths: extraPaths }));
    } catch {
      resolvedDir = findInPnpm(pkg);
    }
    if (!resolvedDir) {
      throw new Error(`unable to resolve path`);
    }
    const linkPath = path.join(nodeModules, pkg);
    if (!fs.existsSync(linkPath)) {
      fs.symlinkSync(resolvedDir, linkPath, 'junction');
      console.log(`Created symlink for ${pkg} -> ${resolvedDir}`);
    }
  } catch (error) {
    console.warn(`prepare-patches: could not resolve ${pkg}: ${error.message}`);
  }
}
