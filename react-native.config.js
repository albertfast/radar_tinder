const path = require('path');

/**
 * Explicitly point React Native autolinking to onnxruntime-react-native.
 * Expo's autolinking sometimes misses it under pnpm + new arch, which causes
 * the native module to be absent (leading to "native module is unavailable").
 */
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      root: path.join(__dirname, 'node_modules', 'onnxruntime-react-native'),
    },
  },
};
