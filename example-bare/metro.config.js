const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

// Pin both the package root and any subpath imports (e.g. 'react/jsx-runtime')
// for these shared packages to this app's node_modules. Otherwise files
// inside example-shared/ will resolve the Expo workspace's react@19 /
// react-native@0.83 hoisted at the repo root.
const PINNED_PACKAGES = [
  'react',
  'react-native',
  '@karus-systems/react-native-honeywell-intent',
];

function isPinned(moduleName) {
  return PINNED_PACKAGES.find(
    pkg => moduleName === pkg || moduleName.startsWith(pkg + '/'),
  );
}

module.exports = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    unstable_enableSymlinks: true,
    resolveRequest: (context, moduleName, platform) => {
      const pkg = isPinned(moduleName);
      if (pkg) {
        const subpath = moduleName.slice(pkg.length); // '' | '/foo/bar'
        const target = require.resolve(
          pkg + subpath + (subpath === '' ? '' : ''),
          {paths: [projectRoot]},
        );
        return {type: 'sourceFile', filePath: target};
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};
