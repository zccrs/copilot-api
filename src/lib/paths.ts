import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const APP_DIR =
  process.env.COPILOT_API_DATA_DIR
  ?? path.join(os.homedir(), ".local", "share", "copilot-api")

const GITHUB_TOKEN_PATH = path.join(APP_DIR, "github_token")
const API_KEYS_PATH =
  process.env.COPILOT_API_KEYS_PATH ?? path.join(APP_DIR, "api_keys.json")
const API_KEY_USAGE_PATH =
  process.env.COPILOT_API_KEY_USAGE_PATH
  ?? path.join(APP_DIR, "api_key_usage.json")
const API_KEY_AUDIT_PATH =
  process.env.COPILOT_API_KEY_AUDIT_PATH
  ?? path.join(APP_DIR, "api_key_audit.json")

export const PATHS = {
  APP_DIR,
  GITHUB_TOKEN_PATH,
  API_KEYS_PATH,
  API_KEY_USAGE_PATH,
  API_KEY_AUDIT_PATH,
}

export async function ensurePaths(): Promise<void> {
  await fs.mkdir(PATHS.APP_DIR, { recursive: true })
  await ensureFile(PATHS.GITHUB_TOKEN_PATH)
  await ensureJsonFile(PATHS.API_KEYS_PATH, "[]")
  await ensureJsonFile(PATHS.API_KEY_USAGE_PATH, "[]")
  await ensureJsonFile(PATHS.API_KEY_AUDIT_PATH, "[]")
}

async function ensureFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, fs.constants.W_OK)
  } catch {
    await fs.writeFile(filePath, "")
    await fs.chmod(filePath, 0o600)
  }
}

async function ensureJsonFile(
  filePath: string,
  initialContent: string,
): Promise<void> {
  try {
    await fs.access(filePath, fs.constants.W_OK)
  } catch {
    await fs.writeFile(filePath, initialContent)
    await fs.chmod(filePath, 0o600)
  }
}
