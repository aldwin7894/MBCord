const path = require('path')
const fs = require('node:fs/promises');

module.exports = {
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {}
    }
  ],
  packagerConfig: {
    overwrite: true,
    asar: true,
    icons: "icons/win/icon.ico",
  },
  makers: [
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'aldwin7894',
          homepage: 'https://aldwin7894.dev'
        }
      }
    },
    {
      name: '@electron-forge/maker-zip'
    }
  ],
  hooks: {
    packageAfterPrune: async (_config, buildPath) => {
      const gypPath = path.join(
        buildPath,
        'node_modules',
        'register-scheme',
        'build',
        'node_gyp_bins'
      );
      await fs.rm(gypPath, {recursive: true, force: true});
    }
  }
}
