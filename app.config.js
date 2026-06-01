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

const APP_VERSION = "1.0.8";
const RUNTIME_VERSION = process.env.EXPO_RUNTIME_VERSION || APP_VERSION;

module.exports = {
  expo: {
    name: "Radar Tinder",
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
      config: {
        googleMapsApiKey: "AIzaSyAtZoFF2DvstwmZuLxh0JR2CsK3clsYtbQ"
      },
      infoPlist: {
        GADApplicationIdentifier: "ca-app-pub-9670547831022880~2252519276",
        SKAdNetworkItems: [
          { SKAdNetworkIdentifier: "cstr6suwn9.skadnetwork" },
          { SKAdNetworkIdentifier: "4fzdc2evr5.skadnetwork" },
          { SKAdNetworkIdentifier: "2fnua5tdw4.skadnetwork" },
          { SKAdNetworkIdentifier: "ydx93a7ass.skadnetwork" },
          { SKAdNetworkIdentifier: "5a6flpkh64.skadnetwork" },
          { SKAdNetworkIdentifier: "p78axxw29g.skadnetwork" },
          { SKAdNetworkIdentifier: "v72qych5uu.skadnetwork" },
          { SKAdNetworkIdentifier: "c6k4g5qg8m.skadnetwork" },
          { SKAdNetworkIdentifier: "s39g8k73mm.skadnetwork" },
          { SKAdNetworkIdentifier: "3qy4746246.skadnetwork" }
        ],
        NSLocationWhenInUseUsageDescription: "This app needs access to location to detect nearby radars and provide accurate alerts.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "This app needs background location access to provide continuous radar detection even when the app is not active.",
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              "com.googleusercontent.apps.1067370631256-maimlqb1grf3ktff6ifk114v569jc6k3"
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
      name: "Radar Tinder",
      shortName: "Radar Tinder",
      lang: "en",
      scope: "./",
      themeColor: "#FF6B35",
      favicon: "./assets/favicon.png"
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
      "./plugins/withIosGoogleMapsInitFix.js"
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
    "android_app_id": "ca-app-pub-9670547831022880~5105162950",
    "ios_app_id": "ca-app-pub-9670547831022880~2252519276"
  }
};
