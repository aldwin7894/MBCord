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
  ]
}
