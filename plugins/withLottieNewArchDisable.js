const { withPodfile } = require('expo/config-plugins');

module.exports = function withLottieNewArchDisable(config) {
  return withPodfile(config, async (config) => {
    let contents = config.modResults.contents;

    // Disable new architecture for lottie-react-native by setting the flag
    // This prevents codegen from trying to generate files for lottie
    const lottieDisableNewArch = `
    # Disable new architecture for lottie-react-native due to incomplete codegen support
    post_install do |installer|
      installer.pods_project.targets.each do |target|
        if target.name == 'lottie-react-native'
          target.build_configurations.each do |config|
            config.build_settings['RCT_NEW_ARCH_ENABLED'] = 'NO'
          end
        end
      end
    end
    `;

    // Check if we already have this patch
    if (!contents.includes('Disable new architecture for lottie-react-native')) {
      // Find the post_install block and add our patch before the end
      const postInstallMatch = contents.match(/post_install do \|installer\|[\s\S]*?^  end$/m);
      
      if (postInstallMatch) {
        // Insert our code before the final 'end' of post_install
        const postInstallBlock = postInstallMatch[0];
        const modifiedBlock = postInstallBlock.replace(
          /^  end$/m,
          `    # Disable new architecture for lottie-react-native due to incomplete codegen support
    installer.pods_project.targets.each do |target|
      if target.name == 'lottie-react-native'
        target.build_configurations.each do |config|
          config.build_settings['RCT_NEW_ARCH_ENABLED'] = 'NO'
        end
      end
    end

  end`
        );
        contents = contents.replace(postInstallBlock, modifiedBlock);
      }
    }

    config.modResults.contents = contents;
    return config;
  });
};
