const fs = require('fs');
const path = require('path');

const packages = ['expo', 'expo-modules-core', 'expo-dev-menu', 'react-native-maps'];
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

const patchExpoModulesCoreForRN81 = () => {
  const pkg = 'expo-modules-core';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const cssPropsPath = path.join(
    resolvedDir,
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'kotlin',
    'views',
    'decorators',
    'CSSProps.kt'
  );

  if (!fs.existsSync(cssPropsPath)) {
    console.warn(`prepare-patches: missing file ${cssPropsPath}`);
    return;
  }

  let cssPropsContent = fs.readFileSync(cssPropsPath, 'utf8');
  const fromCall = 'BoxShadow.parse(shadows.getMap(i))';
  const toCall = 'BoxShadow.parse(shadows.getMap(i), view.context)';

  if (cssPropsContent.includes(fromCall)) {
    cssPropsContent = cssPropsContent.replace(fromCall, toCall);
    fs.writeFileSync(cssPropsPath, cssPropsContent);
    console.log('Patched expo-modules-core CSSProps.kt for React Native 0.81 BoxShadow.parse signature');
  }
};

const patchExpoReactActivityDelegateWrapperForRN81 = () => {
  const pkg = 'expo';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const wrapperPath = path.join(
    resolvedDir,
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'ReactActivityDelegateWrapper.kt'
  );

  if (!fs.existsSync(wrapperPath)) {
    console.warn(`prepare-patches: missing file ${wrapperPath}`);
    return;
  }

  let wrapperContent = fs.readFileSync(wrapperPath, 'utf8');

  const importFrom = 'import com.facebook.react.bridge.ReactContext';
  const importTo = `${importFrom}\nimport com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlags`;
  if (wrapperContent.includes(importFrom) && !wrapperContent.includes('ReactNativeNewArchitectureFeatureFlags')) {
    wrapperContent = wrapperContent.replace(importFrom, importTo);
  }

  const oldCondition = 'if (ReactNativeFeatureFlags.enableBridgelessArchitecture) {';
  const newCondition = [
    'if (',
    '          ReactNativeFeatureFlags.enableBridgelessArchitecture ||',
    '          ReactNativeNewArchitectureFeatureFlags.enableBridgelessArchitecture()',
    '        ) {'
  ].join('\n');

  if (wrapperContent.includes(oldCondition)) {
    wrapperContent = wrapperContent.replace(oldCondition, newCondition);
    fs.writeFileSync(wrapperPath, wrapperContent);
    console.log('Patched expo ReactActivityDelegateWrapper.kt for RN 0.81 bridgeless constructor selection');
    return;
  }

  if (wrapperContent.includes(newCondition)) {
    return;
  }

  fs.writeFileSync(wrapperPath, wrapperContent);
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

  const ensureAirMapImport = (relativeHeaderPath) => {
    const headerPath = path.join(resolvedDir, 'ios', 'AirGoogleMaps', relativeHeaderPath);
    if (!fs.existsSync(headerPath)) return;

    let headerContent = fs.readFileSync(headerPath, 'utf8');
    const missingImport = '#import "AIRMap.h"';
    if (headerContent.includes(missingImport)) return;

    const anchorImport = '#import <React/UIView+React.h>';
    if (headerContent.includes(anchorImport)) {
      headerContent = headerContent.replace(anchorImport, `${anchorImport}\n${missingImport}`);
    } else {
      headerContent = headerContent.replace(
        '#import <GoogleMaps/GoogleMaps.h>',
        '#import <GoogleMaps/GoogleMaps.h>\n' + missingImport
      );
    }
    fs.writeFileSync(headerPath, headerContent);
    console.log(`Patched react-native-maps ${relativeHeaderPath} to import AIRMap.h`);
  };

  ensureAirMapImport('AIRGMSMarker.h');
  ensureAirMapImport('AIRGMSPolyline.h');
  ensureAirMapImport('AIRGMSPolygon.h');

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

const patchRNFBCrashlyticsForModules = () => {
  const pkg = '@react-native-firebase/crashlytics';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const headerPath = path.join(resolvedDir, 'ios', 'RNFBCrashlytics', 'RNFBCrashlyticsModule.h');
  if (fs.existsSync(headerPath)) {
    let header = fs.readFileSync(headerPath, 'utf8');
    const importLine = '#import <RNFBApp/RNFBAppModule.h>';
    if (!header.includes(importLine)) {
      header = header.replace(
        '#import <React/RCTBridgeModule.h>',
        `#import <React/RCTBridgeModule.h>\n${importLine}`
      );
      fs.writeFileSync(headerPath, header);
      console.log('Patched RNFBCrashlyticsModule.h to import RNFBAppModule for module-safe RCTBridgeModule');
    }
  } else {
    console.warn(`prepare-patches: missing file ${headerPath}`);
  }

  const implPath = path.join(resolvedDir, 'ios', 'RNFBCrashlytics', 'RNFBCrashlyticsModule.m');
  if (fs.existsSync(implPath)) {
    let impl = fs.readFileSync(implPath, 'utf8');
    const importLine = '#import <RNFBApp/RNFBAppModule.h>';
    if (!impl.includes(importLine)) {
      impl = impl.replace(
        '#import "RNFBCrashlyticsModule.h"',
        `#import "RNFBCrashlyticsModule.h"\n${importLine}`
      );
      fs.writeFileSync(implPath, impl);
      console.log('Patched RNFBCrashlyticsModule.m to import RNFBAppModule for module-safe RCT_EXPORT_METHOD');
    }
  } else {
    console.warn(`prepare-patches: missing file ${implPath}`);
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
patchExpoModulesCoreForRN81();
patchExpoReactActivityDelegateWrapperForRN81();
patchRNFBCrashlyticsForModules();
