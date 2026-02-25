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

  const preferredImport = '#import "AIRMapCalloutManager.h"';
  const legacyImport = '#import <React/RCTViewManager.h>';
  let markerManagerHeader = fs.readFileSync(markerManagerHeaderPath, 'utf8');

  // Xcode 26 strict module checks expect RCTViewManager to be resolved through
  // react-native-maps' AIRMapCalloutManager module chain for this header.
  // Forcing direct React import here can trigger:
  // "declaration of 'RCTViewManager' must be imported from module
  //  'react_native_maps.AIRMapCalloutManager' before it is required"
  if (markerManagerHeader.includes(legacyImport)) {
    markerManagerHeader = markerManagerHeader.replace(legacyImport, preferredImport);
    fs.writeFileSync(markerManagerHeaderPath, markerManagerHeader);
    console.log('Patched react-native-maps AIRGoogleMapMarkerManager.h to use AIRMapCalloutManager.h');
  } else if (!markerManagerHeader.includes(preferredImport)) {
    markerManagerHeader = markerManagerHeader.replace(
      /#ifdef HAVE_GOOGLE_MAPS\s*\n+/,
      (match) => `${match}${preferredImport}\n\n`
    );
    fs.writeFileSync(markerManagerHeaderPath, markerManagerHeader);
    console.log('Patched react-native-maps AIRGoogleMapMarkerManager.h missing AIRMapCalloutManager import');
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

  const patchAirGoogleMapInsertSubviewGuard = () => {
    const sourceCandidates = ['AIRGoogleMap.mm', 'AIRGoogleMap.m'];

    for (const sourceName of sourceCandidates) {
      const sourcePath = path.join(resolvedDir, 'ios', 'AirGoogleMaps', sourceName);
      if (!fs.existsSync(sourcePath)) continue;

      let source = fs.readFileSync(sourcePath, 'utf8');
      const original = source;

      const insertSignature =
        '- (void)insertReactSubview:(id<RCTComponent>)subview atIndex:(NSInteger)atIndex {';

      if (source.includes(insertSignature) && !source.includes('if (!subview) {\n    return;\n  }')) {
        source = source.replace(
          insertSignature,
          `${insertSignature}\n  if (!subview) {\n    return;\n  }`
        );
      }

      if (
        source.includes('[self insertReactSubview:(UIView *)childSubviews[i] atIndex:atIndex];') &&
        !source.includes('id<RCTComponent> childSubview = childSubviews[i];')
      ) {
        source = source.replace(
          '[self insertReactSubview:(UIView *)childSubviews[i] atIndex:atIndex];',
          [
            'id<RCTComponent> childSubview = childSubviews[i];',
            '      if (!childSubview) {',
            '        continue;',
            '      }',
            '      [self insertReactSubview:(UIView *)childSubview atIndex:atIndex];',
          ].join('\n')
        );
      }

      const legacyInsertCall = '[_reactSubviews insertObject:(UIView *)subview atIndex:(NSUInteger) atIndex];';
      const compactInsertCall = '[_reactSubviews insertObject:(UIView *)subview atIndex:(NSUInteger)atIndex];';
      const hasSafeIndexGuard = source.includes('NSInteger safeAtIndex = atIndex;');
      if (!hasSafeIndexGuard && source.includes(legacyInsertCall)) {
        source = source.replace(
          legacyInsertCall,
          [
            'NSInteger safeAtIndex = atIndex;',
            '  if (safeAtIndex < 0) {',
            '    safeAtIndex = 0;',
            '  } else if (safeAtIndex > _reactSubviews.count) {',
            '    safeAtIndex = _reactSubviews.count;',
            '  }',
            '  [_reactSubviews insertObject:(UIView *)subview atIndex:(NSUInteger)safeAtIndex];',
          ].join('\n  ')
        );
      } else if (!hasSafeIndexGuard && source.includes(compactInsertCall)) {
        source = source.replace(
          compactInsertCall,
          [
            'NSInteger safeAtIndex = atIndex;',
            '  if (safeAtIndex < 0) {',
            '    safeAtIndex = 0;',
            '  } else if (safeAtIndex > _reactSubviews.count) {',
            '    safeAtIndex = _reactSubviews.count;',
            '  }',
            '  [_reactSubviews insertObject:(UIView *)subview atIndex:(NSUInteger)safeAtIndex];',
          ].join('\n  ')
        );
      }

      if (source !== original) {
        fs.writeFileSync(sourcePath, source);
        console.log(`Patched react-native-maps ${sourceName} insertReactSubview nil/index guards`);
      }
    }
  };

  patchAirGoogleMapInsertSubviewGuard();

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

  const normalizeEventDispatcherImports = (relativeSourcePath) => {
    const sourcePath = path.join(resolvedDir, 'ios', relativeSourcePath);
    if (!fs.existsSync(sourcePath)) return;

    let source = fs.readFileSync(sourcePath, 'utf8');
    const dispatcherImportLine = '#import <React/RCTEventDispatcher.h>\n';
    const protocolImportLine = '#import <React/RCTEventDispatcherProtocol.h>\n';
    const bridgeImportLine = '#import <React/RCTBridge.h>\n';

    const hadDispatcherImport = source.includes(dispatcherImportLine);
    const hadProtocolImport = source.includes(protocolImportLine);

    if (hadProtocolImport) {
      source = source.replace(protocolImportLine, '');
    }

    if (hadDispatcherImport) {
      if (source.includes(bridgeImportLine)) {
        source = source.replace(dispatcherImportLine, '');
      } else {
        source = source.replace(dispatcherImportLine, bridgeImportLine);
      }
    }

    // Dedupe if multiple replacements introduced duplicate imports.
    source = source.replace(
      /(#import <React\/RCTBridge\.h>\n){2,}/g,
      '#import <React/RCTBridge.h>\n'
    );

    if (source !== fs.readFileSync(sourcePath, 'utf8')) {
      fs.writeFileSync(sourcePath, source);
      console.log(
        `Patched react-native-maps ${relativeSourcePath} to avoid legacy RCTEventDispatcher imports under Xcode 26`
      );
    }
  };

  [
    'AirMaps/AIRMapCalloutManager.m',
    'AirGoogleMaps/AIRGoogleMapPolylineManager.m',
    'AirGoogleMaps/AIRGoogleMapManager.m',
    'AirMaps/AIRMapPolygonManager.m',
    'AirMaps/AIRMapOverlay.m',
    'AirGoogleMaps/AIRGoogleMapPolygonManager.m',
    'AirGoogleMaps/AIRGoogleMapOverlay.m',
    'AirMaps/AIRMapMarker.m',
    'AirMaps/AIRMapUrlTileManager.m',
    'AirMaps/AIRMap.m',
    'AirMaps/AIRMapWMSTileManager.m',
    'AirMaps/AIRMapManager.m',
    'AirMaps/AIRMapLocalTileManager.m',
    'AirMaps/AIRMapCircleManager.m',
    'AirMaps/AIRMapPolylineManager.m',
  ].forEach(normalizeEventDispatcherImports);
};

const patchReactNativeForXcode26 = () => {
  const pkg = 'react-native';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const componentDataHeaderPath = path.join(
    resolvedDir,
    'React',
    'Views',
    'RCTComponentData.h'
  );

  if (!fs.existsSync(componentDataHeaderPath)) {
    console.warn(`prepare-patches: missing file ${componentDataHeaderPath}`);
    return;
  }

  let componentDataHeader = fs.readFileSync(componentDataHeaderPath, 'utf8');
  const badForwardDecl = '@class RCTEventDispatcherProtocol;';
  const goodForwardDecl = '@protocol RCTEventDispatcherProtocol;';

  if (componentDataHeader.includes(badForwardDecl)) {
    componentDataHeader = componentDataHeader.replace(badForwardDecl, goodForwardDecl);
    fs.writeFileSync(componentDataHeaderPath, componentDataHeader);
    console.log('Patched react-native RCTComponentData.h protocol forward declaration for Xcode 26');
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

const patchRNFBAnalyticsForModules = () => {
  const pkg = '@react-native-firebase/analytics';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const headerPath = path.join(resolvedDir, 'ios', 'RNFBAnalytics', 'RNFBAnalyticsModule.h');
  if (fs.existsSync(headerPath)) {
    let header = fs.readFileSync(headerPath, 'utf8');
    const importLine = '#import <RNFBApp/RNFBAppModule.h>';
    if (!header.includes(importLine)) {
      header = header.replace(
        '#import <React/RCTBridgeModule.h>',
        `#import <React/RCTBridgeModule.h>\n${importLine}`
      );
      fs.writeFileSync(headerPath, header);
      console.log('Patched RNFBAnalyticsModule.h to import RNFBAppModule for module-safe RCTBridgeModule');
    }
  } else {
    console.warn(`prepare-patches: missing file ${headerPath}`);
  }

  const implPath = path.join(resolvedDir, 'ios', 'RNFBAnalytics', 'RNFBAnalyticsModule.m');
  if (fs.existsSync(implPath)) {
    let impl = fs.readFileSync(implPath, 'utf8');
    const importLine = '#import <RNFBApp/RNFBAppModule.h>';
    if (!impl.includes(importLine)) {
      impl = impl.replace(
        '#import "RNFBAnalyticsModule.h"',
        `#import "RNFBAnalyticsModule.h"\n${importLine}`
      );
      fs.writeFileSync(implPath, impl);
      console.log('Patched RNFBAnalyticsModule.m to import RNFBAppModule for module-safe RCT_EXPORT_METHOD');
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
patchReactNativeForXcode26();
patchExpoModulesCoreForRN81();
patchExpoReactActivityDelegateWrapperForRN81();
patchRNFBCrashlyticsForModules();
patchRNFBAnalyticsForModules();
