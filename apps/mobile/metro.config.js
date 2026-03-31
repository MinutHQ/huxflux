const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

// Watch the shared package
config.watchFolders = [workspaceRoot]

// Resolve modules from workspace root as well as project root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

// Resolve @hive/shared source directly
config.resolver.extraNodeModules = {
  "@hive/shared": path.resolve(workspaceRoot, "packages/shared/src"),
  "@hive/tokens": path.resolve(workspaceRoot, "packages/tokens/src/tokens"),
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
