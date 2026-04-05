const { withAndroidManifest } = require("expo/config-plugins")

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0]
    if (app) {
      app.$["android:usesCleartextTraffic"] = "true"
    }
    return config
  })
}
