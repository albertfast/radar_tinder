const fs = require('fs');
const path = require('path');

const getVersionCode = () => {
  // Current timestamp logic
  const now = Math.floor(Date.now() / 1000);
  // Offset to ensure unique version code > 2000000042
  // We use 300,000,000 offset. Current TS ~ 1.74B + 0.3B = 2.04B
  // This will be valid for ~3 years before hitting Int32 limit (2.14B)
  return now + 300000000;
};

module.exports = {
  expo: {
    name: "Radar Tinder",
    scheme: "radartinder",
    slug: "radar-tinder",
    version: "1.0.4",
    icon: "./assets/icon.png",
    orientation: "portrait",
    userInterfaceStyle: "light",
    assetBundlePatterns: [
      "**/*",
      "assets/**/*",
      "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.radartinder.app",
      buildNumber: "43",
      googleServicesFile: "./GoogleService-Info.plist",
      config: {
        googleMapsApiKey: "AIzaSyAtZoFF2DvstwmZuLxh0JR2CsK3clsYtbQ"
      },
      infoPlist: {
        GADApplicationIdentifier: "ca-app-pub-9670547831022880~5105162950",
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
        NSCameraUsageDescription: "This app needs camera access for the AR Radar view.",
        NSMicrophoneUsageDescription: "This app needs microphone access for AI car diagnosis voice input.",
        NSPhotoLibraryUsageDescription: "This app needs access to photo library to select images for diagnosis.",
        NSMotionUsageDescription: "This app needs access to motion data for enhanced radar detection.",
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      package: "com.radartinder.app",
      versionCode: getVersionCode(),
      googleServicesFile: "./google-services.json",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0B0F1A"
      },
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
      "expo-location",
      "expo-notifications",
      "expo-task-manager",
      "expo-secure-store",
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      "./plugins/withFirebasePodfile.js",
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 24,
            targetSdkVersion: 35,
            compileSdkVersion: 35
          },
          ios: {
            deploymentTarget: "15.1"
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
      "./plugins/withReactNativeGradlePluginFix.js"
    ],
    extra: {
      eas: {
        projectId: "62bbc6f8-257a-48e8-adb8-0b80558e3e92"
      }
    },
    owner: "albertfast",
    runtimeVersion: {
      policy: "appVersion"
    },
    updates: {
      enabled: true,
      url: "https://u.expo.dev/62bbc6f8-257a-48e8-adb8-0b80558e3e92",
      fallbackToCacheTimeout: 0
    }
  },
  "react-native-google-mobile-ads": {
    "android_app_id": "ca-app-pub-9670547831022880~5105162950",
    "ios_app_id": "ca-app-pub-9670547831022880~5105162950"
  }
};
