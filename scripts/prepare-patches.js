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
  try {
    const entries = fs.readdirSync(pnpmDir).filter((e) => e.includes(`${pkg}@`));
    for (const entry of entries) {
      const candidate = path.join(pnpmDir, entry, 'node_modules', pkg);
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        return candidate;
      }
    }
  } catch (e) {
    // EPERM or other error scanning .pnpm - fall through
  }
  return null;
};

const resolveViaSymlink = (pkg) => {
  // pnpm creates symlinks: node_modules/pkg -> .pnpm/.../node_modules/pkg
  // Use realpathSync to follow the symlink to the real store path (no EPERM)
  const linkPath = path.join(nodeModules, pkg);
  if (fs.existsSync(linkPath)) {
    try {
      const real = fs.realpathSync(linkPath);
      if (fs.existsSync(path.join(real, 'package.json'))) return real;
    } catch (e) {
      // ignore
    }
  }
  return null;
};

const resolvePackageDir = (pkg) => {
  // Try symlink resolution first (works even when .pnpm scandir returns EPERM)
  const viaSymlink = resolveViaSymlink(pkg);
  if (viaSymlink) return viaSymlink;
  try {
    return path.dirname(require.resolve(`${pkg}/package.json`, { paths: extraPaths }));
  } catch {
    return findInPnpm(pkg);
  }
};

const parseSemver = (version) => {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return { major: 0, minor: 0, patch: 0 };
  }
  return {
    major: Number(match[1]) || 0,
    minor: Number(match[2]) || 0,
    patch: Number(match[3]) || 0,
  };
};

const isVersionAtLeast = (current, min) => {
  if (current.major !== min.major) return current.major > min.major;
  if (current.minor !== min.minor) return current.minor > min.minor;
  return current.patch >= min.patch;
};

const getReactNativeVersion = () => {
  const rnDir = resolvePackageDir('react-native');
  if (!rnDir) return { major: 0, minor: 0, patch: 0 };
  try {
    const rnPkgJsonPath = path.join(rnDir, 'package.json');
    const rnPkgJson = JSON.parse(fs.readFileSync(rnPkgJsonPath, 'utf8'));
    return parseSemver(rnPkgJson.version);
  } catch {
    return { major: 0, minor: 0, patch: 0 };
  }
};

const reactNativeVersion = getReactNativeVersion();
const isReactNative84OrHigher = isVersionAtLeast(reactNativeVersion, {
  major: 0,
  minor: 84,
  patch: 0,
});

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

const patchExpoHmrWindowLocationGuard = () => {
  const pkg = 'expo';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const hmrPath = path.join(resolvedDir, 'src', 'async-require', 'hmr.ts');
  if (!fs.existsSync(hmrPath)) {
    console.warn(`prepare-patches: missing file ${hmrPath}`);
    return;
  }

  let source = fs.readFileSync(hmrPath, 'utf8');
  const original = source;

  const setupPatch =
    "const windowLocation = typeof window !== 'undefined' ? window.location : null;\n" +
    "    const hmrHost = windowLocation?.host || 'localhost';\n" +
    "    const serverScheme = windowLocation?.protocol === 'https:' ? 'wss' : 'ws';\n" +
    "    const client = new MetroHMRClient(`${serverScheme}://${hmrHost}/hot`);";

  if (!source.includes('const windowLocation = typeof window !==')) {
    source = source.replace(
      /const serverScheme = window\.location\.protocol === 'https:' \? 'wss' : 'ws';\n\s*const client = new MetroHMRClient\(`\$\{serverScheme\}:\/\/\$\{window\.location\.host\}\/hot`\);/m,
      setupPatch
    );
  }

  if (!source.includes('const globalDocument =')) {
    const documentPatch =
      "const globalDocument =\n" +
      "        typeof document !== 'undefined' ? document : (globalThis as any).document;\n" +
      "      const currentScript = globalDocument?.currentScript;";
    source = source.replace(
      /const currentScript = document(?:\?|)\.currentScript;/,
      documentPatch
    );
  }

  if (!source.includes('const baseHref = windowLocation?.href')) {
    const bundlePatch =
      "const baseHref = windowLocation?.href || 'http://localhost/';\n" +
      "      const bundleUrl = new URL(\n" +
      "        currentScript && 'src' in currentScript ? currentScript.src : baseHref,\n" +
      "        baseHref\n" +
      "      );";
    source = source.replace(
      /const bundleUrl = new URL\(\n\s*currentScript && 'src' in currentScript \? currentScript\.src : location\.href,\n\s*location\.href\n\s*\);/m,
      bundlePatch
    );
  }

  if (!source.includes('URL: ${hmrHost}')) {
    source = source.replace('URL: ${window.location.host}', 'URL: ${hmrHost}');
  }

  if (source !== original) {
    fs.writeFileSync(hmrPath, source);
    console.log('Patched expo async-require hmr.ts with window.location guards');
  }
};

const patchExpoDevMenuPackagerConnectionForRN84 = () => {
  const pkg = 'expo-dev-menu';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const handlerPath = path.join(resolvedDir, 'ios', 'DevMenuPackagerConnectionHandler.swift');
  if (!fs.existsSync(handlerPath)) {
    console.warn(`prepare-patches: missing file ${handlerPath}`);
    return;
  }

  let handlerSource = fs.readFileSync(handlerPath, 'utf8');
  const originalHandler = handlerSource;

  const rn81CompatibleRegisterMethod = `
  func registerHandlersIfNeeded() {
#if DEBUG
    guard !arePackagerHandlersRegistered else {
      return
    }

    RCTPackagerConnection
      .shared()
      .addNotificationHandler(
        self.sendDevCommandNotificationHandler,
        queue: DispatchQueue.main,
        forMethod: "sendDevCommand"
      )

    RCTPackagerConnection
      .shared()
      .addNotificationHandler(
        self.devMenuNotificationHanlder,
        queue: DispatchQueue.main,
        forMethod: "devMenu"
      )

    arePackagerHandlersRegistered = true
#endif
  }
`;

  if (!isReactNative84OrHigher) {
    const rn84RegisterMethodRegex =
      /[\r\n]+\s*func registerHandlersIfNeeded\(\) \{[\s\S]*?arePackagerHandlersRegistered = true[\s\S]*?#endif[\s\S]*?\n\s*\}/m;
    if (rn84RegisterMethodRegex.test(handlerSource)) {
      handlerSource = handlerSource.replace(rn84RegisterMethodRegex, `\n${rn81CompatibleRegisterMethod}`);
    }

    if (handlerSource.includes('let devSettings = manager?.currentBridge?.devSettings')) {
      handlerSource = handlerSource.replace(
        /guard !arePackagerHandlersRegistered, let devSettings = manager\?\.currentBridge\?\.devSettings else \{[\s\S]*?arePackagerHandlersRegistered = true/m,
        `guard !arePackagerHandlersRegistered else {
      return
    }

    RCTPackagerConnection
      .shared()
      .addNotificationHandler(
        self.sendDevCommandNotificationHandler,
        queue: DispatchQueue.main,
        forMethod: "sendDevCommand"
      )

    RCTPackagerConnection
      .shared()
      .addNotificationHandler(
        self.devMenuNotificationHanlder,
        queue: DispatchQueue.main,
        forMethod: "devMenu"
      )

    arePackagerHandlersRegistered = true`
      );
    }

    if (handlerSource !== originalHandler) {
      fs.writeFileSync(handlerPath, handlerSource);
      console.log('Patched expo-dev-menu DevMenuPackagerConnectionHandler.swift for RN <= 0.83 compatibility');
    }
    return;
  }

  if (!handlerSource.includes('private var arePackagerHandlersRegistered = false')) {
    handlerSource = handlerSource.replace(
      '  private static var suppressRNDevMenu = true',
      '  private static var suppressRNDevMenu = true\n  private var arePackagerHandlersRegistered = false'
    );
  }

  const legacyPackagerConnectionBlock = `    RCTPackagerConnection
      .shared()
      .addNotificationHandler(
        self.sendDevCommandNotificationHandler,
        queue: DispatchQueue.main,
        forMethod: "sendDevCommand"
      )

    RCTPackagerConnection
      .shared()
      .addNotificationHandler(
        self.devMenuNotificationHanlder,
        queue: DispatchQueue.main,
        forMethod: "devMenu"
      )`;

  if (handlerSource.includes(legacyPackagerConnectionBlock)) {
    handlerSource = handlerSource.replace(legacyPackagerConnectionBlock, '    self.registerHandlersIfNeeded()');
  }

  if (!handlerSource.includes('func registerHandlersIfNeeded()')) {
    const registerHandlersMethod = `
  func registerHandlersIfNeeded() {
#if DEBUG
    guard !arePackagerHandlersRegistered, let devSettings = manager?.currentBridge?.devSettings else {
      return
    }

    _ = devSettings.addNotificationHandler(
      self.sendDevCommandNotificationHandler,
      queue: DispatchQueue.main,
      forMethod: "sendDevCommand"
    )

    _ = devSettings.addNotificationHandler(
      self.devMenuNotificationHanlder,
      queue: DispatchQueue.main,
      forMethod: "devMenu"
    )

    arePackagerHandlersRegistered = true
#endif
  }
`;

    handlerSource = handlerSource.replace(
      '  private func swizzleRCTDevMenuShow() {',
      `${registerHandlersMethod}\n  private func swizzleRCTDevMenuShow() {`
    );
  }

  if (handlerSource.includes('func sendDevCommandNotificationHandler(_ params: [String: Any])')) {
    handlerSource = handlerSource.replace(
      'func sendDevCommandNotificationHandler(_ params: [String: Any])',
      'func sendDevCommandNotificationHandler(_ params: [String: Any]?)'
    );
    handlerSource = handlerSource.replace(
      `    guard let manager = manager,
      let command = params["name"] as? String,
      let bridge = manager.currentBridge
    else {
      return
    }`,
      `    guard let manager = manager,
      let params,
      let command = params["name"] as? String,
      let bridge = manager.currentBridge
    else {
      return
    }`
    );
  }

  if (handlerSource.includes('func devMenuNotificationHanlder(_ parames: [String: Any])')) {
    handlerSource = handlerSource.replace(
      'func devMenuNotificationHanlder(_ parames: [String: Any])',
      'func devMenuNotificationHanlder(_ parames: [String: Any]?)'
    );
  }

  if (handlerSource !== originalHandler) {
    fs.writeFileSync(handlerPath, handlerSource);
    console.log('Patched expo-dev-menu DevMenuPackagerConnectionHandler.swift for RN 0.84 packager API');
  }

  const managerPath = path.join(resolvedDir, 'ios', 'DevMenuManager.swift');
  if (!fs.existsSync(managerPath)) {
    console.warn(`prepare-patches: missing file ${managerPath}`);
    return;
  }

  let managerSource = fs.readFileSync(managerPath, 'utf8');
  const originalManager = managerSource;
  const didSetNeedle = `      if let currentBridge {
        disableRNDevMenuHoykeys(for: currentBridge)
      }`;

  if (
    managerSource.includes(didSetNeedle) &&
    !managerSource.includes('packagerConnectionHandler?.registerHandlersIfNeeded()')
  ) {
    managerSource = managerSource.replace(
      didSetNeedle,
      `      if let currentBridge {
        disableRNDevMenuHoykeys(for: currentBridge)
      }
      packagerConnectionHandler?.registerHandlersIfNeeded()`
    );
  }

  if (managerSource !== originalManager) {
    fs.writeFileSync(managerPath, managerSource);
    console.log('Patched expo-dev-menu DevMenuManager.swift to register packager handlers from current bridge');
  }
};

const patchExpoDevLauncherBridgeForRN84 = () => {
  const pkg = 'expo-dev-launcher';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const bridgeHeaderPath = path.join(resolvedDir, 'ios', 'ReactNative', 'EXDevLauncherRCTBridge.h');
  if (!fs.existsSync(bridgeHeaderPath)) {
    console.warn(`prepare-patches: missing file ${bridgeHeaderPath}`);
    return;
  }

  let bridgeHeader = fs.readFileSync(bridgeHeaderPath, 'utf8');
  const originalBridgeHeader = bridgeHeader;

  if (!bridgeHeader.includes('#ifndef RCT_REMOVE_LEGACY_ARCH')) {
    bridgeHeader = bridgeHeader.replace(
      `@interface EXDevLauncherRCTCxxBridge : RCTCxxBridge

- (NSArray<Class> *)filterModuleList:(NSArray<Class> *)modules;

@end

@interface EXDevLauncherRCTBridge : RCTBridge

- (Class)bridgeClass;

@end`,
      `#ifndef RCT_REMOVE_LEGACY_ARCH
@interface EXDevLauncherRCTCxxBridge : RCTCxxBridge

- (NSArray<Class> *)filterModuleList:(NSArray<Class> *)modules;

@end
#endif // RCT_REMOVE_LEGACY_ARCH

@interface EXDevLauncherRCTBridge : RCTBridge

#ifndef RCT_REMOVE_LEGACY_ARCH
- (Class)bridgeClass;
#endif // RCT_REMOVE_LEGACY_ARCH

@end`
    );
  }

  if (bridgeHeader !== originalBridgeHeader) {
    fs.writeFileSync(bridgeHeaderPath, bridgeHeader);
    console.log('Patched expo-dev-launcher EXDevLauncherRCTBridge.h for RN 0.84 legacy-bridge guard');
  }

  const bridgeImplPath = path.join(resolvedDir, 'ios', 'ReactNative', 'EXDevLauncherRCTBridge.m');
  if (!fs.existsSync(bridgeImplPath)) {
    console.warn(`prepare-patches: missing file ${bridgeImplPath}`);
    return;
  }

  let bridgeImpl = fs.readFileSync(bridgeImplPath, 'utf8');
  const originalBridgeImpl = bridgeImpl;

  if (!bridgeImpl.includes('#ifndef RCT_REMOVE_LEGACY_ARCH')) {
    bridgeImpl = bridgeImpl.replace(
      `#import <EXDevLauncher/RCTCxxBridge+Private.h>

#import <React/RCTPerformanceLogger.h>
#import <React/RCTDevSettings.h>
#import <React/RCTDevMenu.h>`,
      `#ifndef RCT_REMOVE_LEGACY_ARCH
#import <EXDevLauncher/RCTCxxBridge+Private.h>

#import <React/RCTPerformanceLogger.h>
#import <React/RCTDevSettings.h>
#import <React/RCTDevMenu.h>
#endif // RCT_REMOVE_LEGACY_ARCH`
    );

    bridgeImpl = bridgeImpl.replace(
      '@implementation EXDevLauncherRCTCxxBridge',
      '#ifndef RCT_REMOVE_LEGACY_ARCH\n@implementation EXDevLauncherRCTCxxBridge'
    );
    bridgeImpl = bridgeImpl.replace(
      '@implementation EXDevLauncherRCTBridge',
      '#endif // RCT_REMOVE_LEGACY_ARCH\n\n@implementation EXDevLauncherRCTBridge'
    );
  }

  const legacyBridgeClassMethod = `- (Class)bridgeClass
{
  return [EXDevLauncherRCTCxxBridge class];
}`;
  if (
    bridgeImpl.includes(legacyBridgeClassMethod) &&
    !bridgeImpl.includes('#ifndef RCT_REMOVE_LEGACY_ARCH\n- (Class)bridgeClass')
  ) {
    bridgeImpl = bridgeImpl.replace(
      legacyBridgeClassMethod,
      `#ifndef RCT_REMOVE_LEGACY_ARCH
- (Class)bridgeClass
{
  return [EXDevLauncherRCTCxxBridge class];
}
#endif // RCT_REMOVE_LEGACY_ARCH`
    );
  }

  if (bridgeImpl !== originalBridgeImpl) {
    fs.writeFileSync(bridgeImplPath, bridgeImpl);
    console.log('Patched expo-dev-launcher EXDevLauncherRCTBridge.m for RN 0.84 legacy-bridge guard');
  }

  const controllerPath = path.join(resolvedDir, 'ios', 'EXDevLauncherController.m');
  if (!fs.existsSync(controllerPath)) {
    console.warn(`prepare-patches: missing file ${controllerPath}`);
    return;
  }

  if (!isReactNative84OrHigher) {
    let controllerSourceLegacy = fs.readFileSync(controllerPath, 'utf8');
    const originalLegacy = controllerSourceLegacy;

    controllerSourceLegacy = controllerSourceLegacy.replace(
      '[self.appBridge.devSettings.packagerConnection setSocketConnectionURL:url];',
      '[[RCTPackagerConnection sharedPackagerConnection] setSocketConnectionURL:url];'
    );
    controllerSourceLegacy = controllerSourceLegacy.replace(
      '[self.appBridge.devSettings.packagerConnection setSocketConnectionURL:bundleUrl];',
      '[[RCTPackagerConnection sharedPackagerConnection] setSocketConnectionURL:bundleUrl];'
    );

    if (controllerSourceLegacy !== originalLegacy) {
      fs.writeFileSync(controllerPath, controllerSourceLegacy);
      console.log(
        'Patched expo-dev-launcher EXDevLauncherController.m for RN <= 0.83 packager connection compatibility'
      );
    }
    return;
  }

  let controllerSource = fs.readFileSync(controllerPath, 'utf8');
  const originalControllerSource = controllerSource;

  controllerSource = controllerSource.replace(
    '[[RCTPackagerConnection sharedPackagerConnection] setSocketConnectionURL:url];',
    '[self.appBridge.devSettings.packagerConnection setSocketConnectionURL:url];'
  );
  controllerSource = controllerSource.replace(
    '[[RCTPackagerConnection sharedPackagerConnection] setSocketConnectionURL:bundleUrl];',
    '[self.appBridge.devSettings.packagerConnection setSocketConnectionURL:bundleUrl];'
  );

  if (controllerSource !== originalControllerSource) {
    fs.writeFileSync(controllerPath, controllerSource);
    console.log('Patched expo-dev-launcher EXDevLauncherController.m packager connection access for RN 0.84');
  }

  // Patch autoSetupStart to not throw when autoSetupPrepare was never called.
  // This happens when APP_DEBUG=false in ExpoDevLauncherReactDelegateHandler.createReactRootView,
  // causing autoSetupPrepare to never run, then autoSetupStart crashes with an NSException.
  // Fix: gracefully skip (log + return) instead of throwing.
  const controllerSource2 = fs.readFileSync(controllerPath, 'utf8');
  const throwBlock =
    '    @throw [NSException exceptionWithName:NSInternalInconsistencyException reason:@"[EXDevLauncherController autoSetupStart:] was called before autoSetupPrepare:.' +
    ' Make sure you\'ve set up expo-modules correctly in AppDelegate and are using ReactDelegate to create a bridge before calling [super application:didFinishLaunchingWithOptions:]." userInfo:nil];';
  const gracefulSkip =
    '    // autoSetupPrepare was not called before autoSetupStart (e.g. APP_DEBUG=false in\n' +
    '    // ExpoDevLauncherReactDelegateHandler.createReactRootView returned nil early).\n' +
    '    // Skip dev-launcher initialization gracefully instead of crashing.\n' +
    '    NSLog(@"[EXDevLauncherController] autoSetupStart: skipping because autoSetupPrepare was not called (non-debug build or APP_DEBUG=false). The app will launch normally without expo-dev-launcher.");';

  if (controllerSource2.includes(throwBlock)) {
    const patched2 = controllerSource2.replace(throwBlock, gracefulSkip);
    fs.writeFileSync(controllerPath, patched2);
    console.log('Patched expo-dev-launcher EXDevLauncherController.m autoSetupStart to not throw when delegate is nil');
  } else if (!controllerSource2.includes('autoSetupPrepare was not called before autoSetupStart')) {
    console.warn('prepare-patches: EXDevLauncherController.m autoSetupStart block did not match; skipping graceful-nil patch');
  }
};

const restoreExpoModulesCoreJSIUtils = () => {
  const pkg = 'expo-modules-core';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const jsiUtilsHeaderPath = path.join(resolvedDir, 'ios', 'JSI', 'EXJSIUtils.h');
  if (!fs.existsSync(jsiUtilsHeaderPath)) {
    console.warn(`prepare-patches: missing file ${jsiUtilsHeaderPath}`);
    return;
  }

  let header = fs.readFileSync(jsiUtilsHeaderPath, 'utf8');
  const declaration =
    'void callPromiseSetupWithBlock(jsi::Runtime &runtime, std::shared_ptr<react::CallInvoker> jsInvoker, std::shared_ptr<react::Promise> promise, PromiseInvocationBlock setupBlock);';
  const markerLine = '// PATCHED: CallInvoker compatibility fix for React Native 0.84+';
  const callbackWrapperImport = '#import <react/bridging/CallbackWrapper.h>';
  const legacyCallbackWrapperImport = '#import <ReactCommon/CallbackWrapper.h>';
  let headerChanged = false;

  if (header.includes(markerLine)) {
    header = header.replace(/\/\/ PATCHED: CallInvoker compatibility fix for React Native 0\.84\+\n/g, '');
    headerChanged = true;
  }

  if (header.includes(legacyCallbackWrapperImport)) {
    header = header.replace(legacyCallbackWrapperImport, callbackWrapperImport);
    headerChanged = true;
  }

  if (!header.includes(callbackWrapperImport) && header.includes('#import <ReactCommon/TurboModuleUtils.h>')) {
    header = header.replace(
      '#import <ReactCommon/TurboModuleUtils.h>',
      `#import <ReactCommon/TurboModuleUtils.h>\n${callbackWrapperImport}`
    );
    headerChanged = true;
  }

  const commentedDeclarationRegex =
    /^\s*\/\/\s*void callPromiseSetupWithBlock\(jsi::Runtime &runtime, std::shared_ptr<react::CallInvoker> jsInvoker, std::shared_ptr<react::Promise> promise, PromiseInvocationBlock setupBlock\);\s*$/m;
  if (commentedDeclarationRegex.test(header)) {
    header = header.replace(commentedDeclarationRegex, `    ${declaration}`);
    headerChanged = true;
  }

  if (headerChanged) {
    fs.writeFileSync(jsiUtilsHeaderPath, header);
    console.log('Patched expo-modules-core EXJSIUtils.h for RN 0.84 CallbackWrapper compatibility');
  }

  const jsiUtilsImplPath = path.join(resolvedDir, 'ios', 'JSI', 'EXJSIUtils.mm');
  if (!fs.existsSync(jsiUtilsImplPath)) {
    console.warn(`prepare-patches: missing file ${jsiUtilsImplPath}`);
    return;
  }

  let impl = fs.readFileSync(jsiUtilsImplPath, 'utf8');
  const startRegex =
    /(?:^|\n)\s*(?:\/\/\s*)*void callPromiseSetupWithBlock\(jsi::Runtime &runtime, std::shared_ptr<CallInvoker> jsInvoker, std::shared_ptr<Promise> promise, PromiseInvocationBlock setupBlock\)/;
  const startMatch = impl.match(startRegex);
  const pragmaNeedle = '\n#pragma mark - Weak objects';

  if (startMatch && typeof startMatch.index === 'number') {
    const startIdx = startMatch.index + (startMatch[0].startsWith('\n') ? 1 : 0);
    const endIdx = impl.indexOf(pragmaNeedle, startIdx);
    if (endIdx !== -1) {
      const beforeFunc = impl.substring(0, startIdx);
      let funcBody = impl.substring(startIdx, endIdx);
      const afterFunc = impl.substring(endIdx);
      let restoredPasses = 0;

      while (/^\s*(?:\/\/\s*)+void callPromiseSetupWithBlock/m.test(funcBody) && restoredPasses < 5) {
        funcBody = funcBody
          .split('\n')
          .map((line) => line.replace(/^(\s*)\/\/\s?/, '$1'))
          .join('\n');
        restoredPasses += 1;
      }

      const restoredImpl = beforeFunc + funcBody + afterFunc;
      if (restoredImpl !== impl) {
        fs.writeFileSync(jsiUtilsImplPath, restoredImpl);
        console.log('Restored expo-modules-core EXJSIUtils.mm callPromiseSetupWithBlock implementation');
      }
    }
  }
};

const patchLottieReactNativeCodegen = () => {
  const pkg = 'lottie-react-native';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  // Create the missing codegen directory structure for lottie-react-native
  const codegenDir = path.join(
    __dirname,
    '..',
    'ios',
    'build',
    'generated',
    'ios',
    'ReactCodegen',
    'react',
    'renderer',
    'components',
    'lottiereactnative'
  );

  if (!fs.existsSync(codegenDir)) {
    fs.mkdirSync(codegenDir, { recursive: true });
    console.log('Created lottie-react-native codegen directory structure');
  }

  // Create placeholder header files if they don't exist
  const headerFiles = ['States.h', 'ShadowNodes.h', 'RCTComponentViewHelpers.h', 'Props.h', 'EventEmitters.h', 'ComponentDescriptors.h'];

  for (const headerFile of headerFiles) {
    const headerPath = path.join(codegenDir, headerFile);
    if (!fs.existsSync(headerPath)) {
      const content = `// Placeholder header for ${headerFile}
// This file is auto-generated but may be missing in some build configurations
#pragma once
`;
      fs.writeFileSync(headerPath, content);
      console.log(`Created placeholder ${headerFile} for lottie-react-native`);
    }
  }
};

const patchReactNativeXcodeMetroIpWriteGuard = () => {
  const pkg = 'react-native';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const scriptPaths = [
    path.join(resolvedDir, 'scripts', 'react-native-xcode.sh'),
    path.join(nodeModules, 'react-native', 'scripts', 'react-native-xcode.sh'),
  ];

  const writeNeedle = '  echo "$IP" > "$DEST/ip.txt"';
  const writePatch = [
    '  if ! echo "$IP" > "$DEST/ip.txt" 2>/dev/null; then',
    '    echo "warning: Skipping Metro IP file write to $DEST/ip.txt (sandboxed)."',
    '  fi',
  ].join('\n');

  const hermesWarningNeedle =
    '  "$HERMES_CLI_PATH" -emit-binary -max-diagnostic-width=80 $EXTRA_COMPILER_ARGS -out "$DEST/$BUNDLE_NAME.jsbundle" "$BUNDLE_FILE"';
  const hermesWarningPatch = [
    '  HERMES_WARNING_ARGS=',
    '  if [[ "${CONFIGURATION:-}" == *Release* ]]; then',
    '    HERMES_WARNING_ARGS=-w',
    '  fi',
    '  "$HERMES_CLI_PATH" -emit-binary -max-diagnostic-width=80 $HERMES_WARNING_ARGS $EXTRA_COMPILER_ARGS -out "$DEST/$BUNDLE_NAME.jsbundle" "$BUNDLE_FILE"',
  ].join('\n');

  let patchedAny = false;
  const visited = new Set();

  for (const scriptPath of scriptPaths) {
    const realPath = fs.existsSync(scriptPath) ? fs.realpathSync(scriptPath) : null;
    const canonicalPath = realPath || scriptPath;
    if (visited.has(canonicalPath)) continue;
    visited.add(canonicalPath);

    if (!fs.existsSync(scriptPath)) {
      console.warn(`prepare-patches: missing file ${scriptPath}`);
      continue;
    }

    let source = fs.readFileSync(scriptPath, 'utf8');
    const original = source;

    if (source.includes(writeNeedle) && !source.includes('Skipping Metro IP file write')) {
      source = source.replace(writeNeedle, writePatch);
    }

    if (source.includes(hermesWarningNeedle) && !source.includes('HERMES_WARNING_ARGS')) {
      source = source.replace(hermesWarningNeedle, hermesWarningPatch);
    }

    if (source !== original) {
      fs.writeFileSync(scriptPath, source);
      patchedAny = true;
    }
  }

  if (patchedAny) {
    console.log('Patched react-native react-native-xcode.sh Metro IP and Hermes warning guards');
  }
};

const patchExpoDevLauncherAutoSetupPrepare = () => {
  const pkg = 'expo-dev-launcher';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const handlerPath = path.join(
    resolvedDir,
    'ios',
    'ReactDelegateHandler',
    'ExpoDevLauncherReactDelegateHandler.swift'
  );
  if (!fs.existsSync(handlerPath)) {
    console.warn(`prepare-patches: missing file ${handlerPath}`);
    return;
  }

  let source = fs.readFileSync(handlerPath, 'utf8');

  // The original code checks APP_DEBUG BEFORE calling autoSetupPrepare.
  // If APP_DEBUG is false (e.g. in a non-debug build or before EXAppDefines loads),
  // autoSetupPrepare is never called. Later, ExpoDevLauncherAppDelegateSubscriber
  // calls autoSetupStart which throws because the delegate was never set.
  //
  // Fix: always call autoSetupPrepare first (and still bail early if !APP_DEBUG).
  const originalBlock =
    '    if !EXAppDefines.APP_DEBUG {\n' +
    '      return nil\n' +
    '    }\n' +
    '\n' +
    '    self.reactDelegate = reactDelegate\n' +
    '    self.launchOptions = launchOptions\n' +
    '    EXDevLauncherController.sharedInstance().autoSetupPrepare(self, launchOptions: launchOptions)';

  const patchedBlock =
    '    // Always call autoSetupPrepare first so that the delegate is set before\n' +
    '    // ExpoDevLauncherAppDelegateSubscriber.application() calls autoSetupStart.\n' +
    '    // Without this, if APP_DEBUG is false the delegate is never set and autoSetupStart throws.\n' +
    '    self.reactDelegate = reactDelegate\n' +
    '    self.launchOptions = launchOptions\n' +
    '    EXDevLauncherController.sharedInstance().autoSetupPrepare(self, launchOptions: launchOptions)\n' +
    '\n' +
    '    if !EXAppDefines.APP_DEBUG {\n' +
    '      return nil\n' +
    '    }';

  if (source.includes(originalBlock)) {
    source = source.replace(originalBlock, patchedBlock);
    fs.writeFileSync(handlerPath, source);
    console.log(
      'Patched expo-dev-launcher ExpoDevLauncherReactDelegateHandler.swift: ' +
      'moved autoSetupPrepare before APP_DEBUG guard to fix autoSetupStart crash'
    );
  } else if (!source.includes('// Always call autoSetupPrepare first')) {
    console.warn(
      'prepare-patches: ExpoDevLauncherReactDelegateHandler.swift did not match expected pattern; ' +
      'skipping autoSetupPrepare patch'
    );
  }
};

const patchExpoUpdatesReactDelegateHandler = () => {
  const pkg = 'expo-updates';
  const resolvedDir = resolvePackageDir(pkg);
  if (!resolvedDir) {
    console.warn(`prepare-patches: could not resolve ${pkg}: unable to resolve path`);
    return;
  }

  const handlerPath = path.join(
    resolvedDir,
    'ios', 'EXUpdates', 'ReactDelegateHandler',
    'ExpoUpdatesReactDelegateHandler.swift'
  );
  if (!fs.existsSync(handlerPath)) {
    console.warn(`prepare-patches: missing file ${handlerPath}`);
    return;
  }

  let source = fs.readFileSync(handlerPath, 'utf8');

  // bundleURL(reactDelegate:) calls AppController.sharedInstance.launchAssetUrl() unconditionally.
  // When createReactRootView returns nil early (isActiveController=false, e.g. apps not using
  // custom expo-updates initialization), the AppController may not have been initialized yet.
  // Accessing sharedInstance before initialization hits a Swift assertionFailure (SIGTRAP crash).
  // Fix: guard with AppController.isInitialized() and return nil if not ready.
  const originalBundleURL =
    '  public override func bundleURL(reactDelegate: ExpoReactDelegate) -> URL? {\n' +
    '    AppController.sharedInstance.launchAssetUrl()\n' +
    '  }';
  const patchedBundleURL =
    '  public override func bundleURL(reactDelegate: ExpoReactDelegate) -> URL? {\n' +
    '    // Guard against accessing sharedInstance before initialization.\n' +
    '    // This can happen when createReactRootView returns nil early (e.g. isActiveController=false)\n' +
    '    // but bundleURL is still called by the React delegate chain.\n' +
    '    guard AppController.isInitialized() else {\n' +
    '      return nil\n' +
    '    }\n' +
    '    return AppController.sharedInstance.launchAssetUrl()\n' +
    '  }';

  if (source.includes(originalBundleURL)) {
    source = source.replace(originalBundleURL, patchedBundleURL);
    fs.writeFileSync(handlerPath, source);
    console.log('Patched expo-updates ExpoUpdatesReactDelegateHandler.swift: guarded bundleURL against uninitialized AppController');
  } else if (!source.includes('AppController.isInitialized()')) {
    console.warn('prepare-patches: ExpoUpdatesReactDelegateHandler.swift bundleURL did not match; skipping guard patch');
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
patchExpoHmrWindowLocationGuard();
patchExpoDevMenuPackagerConnectionForRN84();
patchExpoDevLauncherBridgeForRN84();
patchExpoDevLauncherAutoSetupPrepare();
restoreExpoModulesCoreJSIUtils();
patchLottieReactNativeCodegen();
patchReactNativeXcodeMetroIpWriteGuard();
patchExpoUpdatesReactDelegateHandler();
