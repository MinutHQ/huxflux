const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

// Prevent Expo from using the monorepo root as Metro's server root.
// Without this, the Android client requests /index.bundle but Metro resolves
// it from the workspace root (where no index.ts exists).
process.env.EXPO_NO_METRO_WORKSPACE_ROOT = "1"

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

// Watch the shared packages and workspace node_modules
config.watchFolders = [
  path.resolve(workspaceRoot, "packages"),
  path.resolve(workspaceRoot, "node_modules"),
]

// Resolve modules from workspace root as well as project root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

// Resolve @huxflux/shared source directly
config.resolver.extraNodeModules = {
  "@huxflux/shared": path.resolve(workspaceRoot, "packages/shared/src"),
  "@huxflux/tokens": path.resolve(workspaceRoot, "packages/tokens/src/tokens"),
}

// Force singleton packages to always resolve from the app's own node_modules,
// regardless of which file is doing the importing (fixes duplicate React in monorepos).
const SINGLETONS = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-native",
  "@tanstack/react-query",
]

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETONS.some((s) => moduleName === s || moduleName.startsWith(s + "/"))) {
    const resolved = require.resolve(moduleName, {
      paths: [path.resolve(projectRoot, "node_modules")],
    })
    return { filePath: resolved, type: "sourceFile" }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
