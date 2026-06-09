const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const LOCATION_TASK_SERVICE = 'expo.modules.location.services.LocationTaskService';

const ensureLocationTaskService = (manifest) => {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.service = application.service || [];

  const existing = application.service.find(
    (entry) => entry?.$?.['android:name'] === LOCATION_TASK_SERVICE
  );

  if (existing) {
    existing.$['android:exported'] = 'false';
    existing.$['android:foregroundServiceType'] = 'location';
    return manifest;
  }

  application.service.push({
    $: {
      'android:name': LOCATION_TASK_SERVICE,
      'android:exported': 'false',
      'android:foregroundServiceType': 'location',
    },
  });

  return manifest;
};

/** Ensures expo-location foreground service is declared for background GPS (Android 14+). */
module.exports = function withAndroidLocationForegroundService(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults.manifest = ensureLocationTaskService(config.modResults.manifest);
    return config;
  });
};
