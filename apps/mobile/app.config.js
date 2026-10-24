// Release builds set HUXFLUX_APP_VERSION to the release version, so the APK
// reports the same version the in-app updater compares against. Local builds
// stay on app.json's 0.0.0 and are always offered the newest release.

/** Android needs an increasing integer: 0.4.12-beta.3 becomes 412003, 0.4.12 becomes 412999. */
function versionCode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[a-z]+\.(\d+))?$/.exec(version)
  if (!match) return 1
  const [, major, minor, patch, pre] = match
  const build = pre === undefined ? 999 : Math.min(Number(pre), 998)
  return Number(major) * 10_000_000 + Number(minor) * 100_000 + Number(patch) * 1000 + build
}

module.exports = ({ config }) => {
  const version = process.env.HUXFLUX_APP_VERSION
  if (!version) return config
  return {
    ...config,
    version,
    android: { ...config.android, versionCode: versionCode(version) },
  }
}
