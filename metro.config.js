const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// On web, redirect the native-only `react-native-maps` to a local stub so the
// web bundle compiles. Native (iOS/Android) resolution is untouched.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'web-stubs/react-native-maps.js'),
    };
  }
  return (originalResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform
  );
};

module.exports = config;
