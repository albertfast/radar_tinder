const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_ORT_ANDROID_VERSION = '1.23.2';
const ORT_ANDROID_VERSION = (
  process.env.EXPO_PUBLIC_ORT_ANDROID_VERSION || DEFAULT_ORT_ANDROID_VERSION
).trim();

const getGitShortCommit = () => {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'nogit';
  }
};

const BUILD_TIMESTAMP_MS = process.env.BUILD_TIMESTAMP_MS || Date.now().toString();
const GIT_COMMIT_SHORT = process.env.GIT_COMMIT_SHORT || getGitShortCommit();
const BUILD_FINGERPRINT = (
  process.env.EXPO_PUBLIC_BUILD_FINGERPRINT || `${GIT_COMMIT_SHORT}-${BUILD_TIMESTAMP_MS}`
).trim();

const getAndroidVersionCode = () => {
  try {
    const explicitVersionCode = process.env.ANDROID_VERSION_CODE;
    if (explicitVersionCode && explicitVersionCode.trim()) {
      const parsed = parseInt(explicitVersionCode.trim(), 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
      console.warn(`Invalid ANDROID_VERSION_CODE='${explicitVersionCode}', falling back to version file.`);
    }

    const versionFile = path.join(__dirname, 'android_version_code.txt');
    let versionCode = 2000000043; // Starting point higher than current

    if (fs.existsSync(versionFile)) {
      versionCode = parseInt(fs.readFileSync(versionFile, 'utf8').trim(), 10);
    }

    return versionCode;
  } catch (e) {
    console.warn('Version code generation failed, using fallback:', e);
    return 2100000000;
  }
};

const getIosBuildNumber = () => {
  if (process.env.IOS_BUILD_NUMBER) {
    return process.env.IOS_BUILD_NUMBER;
  }

  // Millisecond precision prevents duplicate uploads from rapid consecutive archives.
  return Date.now().toString();
};

const APP_VERSION = "1.1.1";
const RUNTIME_VERSION = process.env.EXPO_RUNTIME_VERSION || APP_VERSION;

module.exports = {
  expo: {
    name: "Radar Flow",
    scheme: "radartinder",
    slug: "radar-tinder",
    version: APP_VERSION,
    icon: "./assets/icon.png",
    orientation: "portrait",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    assetBundlePatterns: [
      "**/*",
      "assets/**/*",
      "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.radartinder.app",
      buildNumber: getIosBuildNumber(),
      googleServicesFile: "./GoogleService-Info.plist",
      infoPlist: {
        CFBundleDisplayName: "Radar Flow",
        CFBundleName: "Radar Flow",
        FacebookAppID: "1749944202801225",
        FacebookDisplayName: "Radar Flow",
        FacebookClientToken: "fa45d0b901298719a1de6bb3a6d504ad",
        GADApplicationIdentifier: "ca-app-pub-9670547831022880~2252519276",
        SKAdNetworkItems: [
          "cstr6suwn9.skadnetwork",
          "4fzdc2evr5.skadnetwork",
          "2fnua5tdw4.skadnetwork",
          "ydx93a7ass.skadnetwork",
          "p78axxw29g.skadnetwork",
          "v72qych5uu.skadnetwork",
          "ludvb6z3bs.skadnetwork",
          "cp8zw746q7.skadnetwork",
          "3sh42y64q3.skadnetwork",
          "c6k4g5qg8m.skadnetwork",
          "s39g8k73mm.skadnetwork",
          "wg4vff78zm.skadnetwork",
          "3qy4746246.skadnetwork",
          "f38h382jlk.skadnetwork",
          "hs6bdukanm.skadnetwork",
          "mlmmfzh3r3.skadnetwork",
          "v4nxqhlyqp.skadnetwork",
          "wzmmz9fp6w.skadnetwork",
          "su67r6k2v3.skadnetwork",
          "yclnxrl5pm.skadnetwork",
          "t38b2kh725.skadnetwork",
          "7ug5zh24hu.skadnetwork",
          "gta9lk7p23.skadnetwork",
          "vutu7akeur.skadnetwork",
          "y5ghdn5j9k.skadnetwork",
          "v9wttpbfk9.skadnetwork",
          "n38lu8286q.skadnetwork",
          "47vhws6wlr.skadnetwork",
          "kbd757ywx3.skadnetwork",
          "9t245vhmpl.skadnetwork",
          "a2p9lx4jpn.skadnetwork",
          "22mmun2rn5.skadnetwork",
          "44jx6755aq.skadnetwork",
          "k674qkevps.skadnetwork",
          "4468km3ulz.skadnetwork",
          "2u9pt9hc89.skadnetwork",
          "8s468mfl3y.skadnetwork",
          "klf5c3l5u5.skadnetwork",
          "ppxm28t8ap.skadnetwork",
          "kbmxgpxpgc.skadnetwork",
          "uw77j35x4d.skadnetwork",
          "578prtvx9j.skadnetwork",
          "4dzt52r2t5.skadnetwork",
          "tl55sbb4fm.skadnetwork",
          "c3frkrj4fj.skadnetwork",
          "e5fvkxwrpn.skadnetwork",
          "8c4e2ghe7u.skadnetwork",
          "3rd42ekr43.skadnetwork",
          "97r2b46745.skadnetwork",
          "3qcr597p9d.skadnetwork"
        ].map((identifier) => ({ SKAdNetworkIdentifier: identifier })),
        NSLocationWhenInUseUsageDescription: "This app needs access to location to detect nearby radars and provide accurate alerts.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "This app needs background location access to provide continuous radar detection even when the app is not active.",
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              "com.googleusercontent.apps.1067370631256-maimlqb1grf3ktff6ifk114v569jc6k3",
              "fb1749944202801225"
            ]
          }
        ],
        UIBackgroundModes: [
          "location",
          "fetch"
        ],
        NSCameraUsageDescription: "This app needs camera access to capture dashboard photos in AI Diagnose.",
        NSMicrophoneUsageDescription: "This app needs microphone access for AI car diagnosis voice input.",
        NSPhotoLibraryUsageDescription: "This app needs access to photo library to select images for diagnosis.",
        NSMotionUsageDescription: "This app needs access to motion data for enhanced radar detection.",
        NSUserTrackingUsageDescription: "This app uses tracking data to show you personalized ads.",
        // Relax ATS so AdMob/mediation rich-media and video creatives are not
        // silently blocked. Matches the production-proven sibling app. Without
        // this, several ad networks' creatives fail to load under strict ATS.
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSAllowsLocalNetworking: true,
        },
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      package: "com.radartinder.app",
      versionCode: getAndroidVersionCode(),
      googleServicesFile: "./google-services.json",
      softwareKeyboardLayoutMode: "pan",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0B0F1A"
      },
      jsEngine: "hermes",
      permissions: [
        "ACCESS_BACKGROUND_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "POST_NOTIFICATIONS",
        "WAKE_LOCK",
        "RECEIVE_BOOT_COMPLETED",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "ACCESS_NETWORK_STATE",
        "INTERNET",
        "CAMERA",
        "RECORD_AUDIO"
      ],
      config: {
        googleMaps: {
          apiKey: "AIzaSyAtZoFF2DvstwmZuLxh0JR2CsK3clsYtbQ"
        }
      }
    },
    web: {
      name: "Radar Flow",
      shortName: "Radar Flow",
      lang: "en",
      scope: "./",
      themeColor: "#FF6B35",
      favicon: "./assets/icon.png"
    },
    plugins: [
      "expo-localization",
      "expo-asset",
      "expo-font",
      "expo-location",
      "expo-notifications",
      "expo-task-manager",
      "expo-secure-store",
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      "@react-native-firebase/crashlytics",
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 24,
            targetSdkVersion: 36,
            compileSdkVersion: 36,
            gradlePluginVersion: "8.5.2",
            ndkVersion: "28.0.13004108",

            packagingOptions: {
              pickFirst: ["**/libreactnative.so"]
            },
            extraMavenRepos: [
              "https://repo1.maven.org/maven2"
            ]
          },
          ios: {
            deploymentTarget: "16.1",
            useFrameworks: "static",
            buildReactNativeFromSource: true
          }
        }
      ],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#ffffff",
          darkModeBackgroundColor: "#000000",
          image: "./assets/splash.png",
          imageWidth: 200,
          resizeMode: "contain"
        }
      ],
      "./plugins/withFirebasePodfile.js",
      "./plugins/withPodfileFix.js",
      "./plugins/withSettingsGradleFix.js",
      "./plugins/withAndroidReleaseSigning.js",
      "./plugins/withOnnxRuntime.js",
      "./plugins/withAndroidCustomNative.js",
      "./plugins/withIosHermesDsym.js",
      "./plugins/withIosFmtConstevalFix.js"
    ],
    extra: {
      buildFingerprint: BUILD_FINGERPRINT,
      buildTimestampMs: BUILD_TIMESTAMP_MS,
      gitCommitShort: GIT_COMMIT_SHORT,
      ortAndroidVersion: ORT_ANDROID_VERSION,
      eas: {
        projectId: "62bbc6f8-257a-48e8-adb8-0b80558e3e92"
      }
    },
    owner: "albertfast",
    runtimeVersion: RUNTIME_VERSION,
    updates: {
      enabled: true,
      url: "https://u.expo.dev/62bbc6f8-257a-48e8-adb8-0b80558e3e92",
      checkAutomatically: "ON_ERROR_RECOVERY",
      fallbackToCacheTimeout: 0,
      assetPatternsToBeBundled: [
        "assets/models/**/*"
      ]
    }
  },
  "react-native-google-mobile-ads": {
    "androidAppId": "ca-app-pub-9670547831022880~5105162950",
    "iosAppId": "ca-app-pub-9670547831022880~2252519276"
  }
};
