import "dotenv/config"

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  dbPath: process.env.DB_PATH ?? "./hive.db",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  workspacesBase: process.env.WORKSPACES_BASE ?? `${process.env.HOME}/.hive/workspaces`,
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : true,
}
