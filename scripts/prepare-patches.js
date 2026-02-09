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

const resolvePackageDir = (pkg) => {
  try {
    return path.dirname(require.resolve(`${pkg}/package.json`, { paths: extraPaths }));
  } catch {
    return findInPnpm(pkg);
  }
};

const patchReactNativeMapsForXcode26 = () => {
  const pkg = 'react-native-maps';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const markerManagerHeaderPath = path.join(
    resolvedDir,
    'ios',
    'AirGoogleMaps',
    'AIRGoogleMapMarkerManager.h'
  );
  if (!fs.existsSync(markerManagerHeaderPath)) {
    console.warn(`prepare-patches: missing file ${markerManagerHeaderPath}`);
    return;
  }

  const fromImport = '#import <React/RCTViewManager.h>';
  const toImport = '#import "AIRMapCalloutManager.h"';
  let markerManagerHeader = fs.readFileSync(markerManagerHeaderPath, 'utf8');

  if (markerManagerHeader.includes(fromImport)) {
    markerManagerHeader = markerManagerHeader.replace(fromImport, toImport);
    fs.writeFileSync(markerManagerHeaderPath, markerManagerHeader);
    console.log('Patched react-native-maps AIRGoogleMapMarkerManager.h for Xcode 26 modules');
  }

  const gmsMarkerHeaderPath = path.join(resolvedDir, 'ios', 'AirGoogleMaps', 'AIRGMSMarker.h');
  if (fs.existsSync(gmsMarkerHeaderPath)) {
    let gmsMarkerHeader = fs.readFileSync(gmsMarkerHeaderPath, 'utf8');
    const missingImport = '#import "AIRMap.h"';
    if (!gmsMarkerHeader.includes(missingImport)) {
      const anchorImport = '#import <React/UIView+React.h>';
      if (gmsMarkerHeader.includes(anchorImport)) {
        gmsMarkerHeader = gmsMarkerHeader.replace(
          anchorImport,
          `${anchorImport}\n${missingImport}`
        );
      } else {
        gmsMarkerHeader = gmsMarkerHeader.replace(
          '#import <GoogleMaps/GoogleMaps.h>',
          '#import <GoogleMaps/GoogleMaps.h>\n' + missingImport
        );
      }
      fs.writeFileSync(gmsMarkerHeaderPath, gmsMarkerHeader);
      console.log('Patched react-native-maps AIRGMSMarker.h to import AIRMap.h');
    }
  }

  // AIRGoogleMapPolyline does not use AIRGoogleMapMarkerManager and this import can
  // trigger strict module resolution failures under Xcode 26.
  const polylinePath = path.join(resolvedDir, 'ios', 'AirGoogleMaps', 'AIRGoogleMapPolyline.m');
  if (!fs.existsSync(polylinePath)) {
    return;
  }
  let polylineContent = fs.readFileSync(polylinePath, 'utf8');
  const unusedImport = '#import "AIRGoogleMapMarkerManager.h"\n';
  if (polylineContent.includes(unusedImport)) {
    polylineContent = polylineContent.replace(unusedImport, '');
    fs.writeFileSync(polylinePath, polylineContent);
    console.log('Patched react-native-maps AIRGoogleMapPolyline.m to remove unused import');
  }
};

for (const pkg of packages) {
  try {
    const resolvedDir = resolvePackageDir(pkg);
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

patchReactNativeMapsForXcode26();
