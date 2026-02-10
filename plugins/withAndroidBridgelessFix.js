const { withMainActivity } = require('@expo/config-plugins');

/**
 * Plugin to fix the "Cannot add a null child view" crash in bridgeless/new architecture mode.
 * The issue occurs when ReactActivityDelegateWrapper tries to add a null reactRootView
 * because bridgeless mode doesn't use the old ReactRootView API.
 */
function withAndroidBridgelessFix(config) {
  return withMainActivity(config, (config) => {
    const mainActivity = config.modResults;
    
    // Ensure we pass BuildConfig.IS_NEW_ARCHITECTURE_ENABLED to the wrapper
    // so it knows to use bridgeless mode properly
    if (mainActivity.language === 'java') {
      // For Java files
      mainActivity.contents = mainActivity.contents.replace(
        /new ReactActivityDelegateWrapper\(\s*this,\s*false,/g,
        'new ReactActivityDelegateWrapper(\n          this,\n          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,'
      );
    } else {
      // For Kotlin files - ensure we're passing the correct flag
      mainActivity.contents = mainActivity.contents.replace(
        /return ReactActivityDelegateWrapper\(\s*this,\s*BuildConfig\.IS_NEW_ARCHITECTURE_ENABLED,\s*object : DefaultReactActivityDelegate\(\s*this,\s*mainComponentName,\s*fabricEnabled\s*\){}\s*\)/gs,
        `return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          DefaultReactActivityDelegate(
              this,
              mainComponentName,
              BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          )
      )`
      );
    }
    
    return config;
  });
}

module.exports = withAndroidBridgelessFix;
