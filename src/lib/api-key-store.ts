import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { PATHS } from "~/lib/paths"

const API_TOKEN_ENV = "COPILOT_API_TOKEN"
const KEY_ID_PATTERN = /^[\w.-]+$/

export class ManagedApiKeyError extends Error {
  code: "duplicate-id" | "invalid-id"

  constructor(code: "duplicate-id" | "invalid-id", message: string) {
    super(message)
    this.code = code
  }
}

export interface ManagedApiKey {
  id: string
  key: string
  createdAt: string
}

export interface ManagedApiKeyListItem {
  id: string
  prefix: string
  createdAt: string
}

const normalizeKeyId = (id: string): string => id.trim()

const parseEnvTokens = (raw: string | undefined): Array<string> =>
  raw
    ?.split(";")
    .map((token) => token.trim())
    .filter((token) => token.length > 0) ?? []

const isManagedApiKey = (value: unknown): value is ManagedApiKey => {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<ManagedApiKey>
  return (
    typeof candidate.id === "string"
    && typeof candidate.key === "string"
    && typeof candidate.createdAt === "string"
  )
}

const readManagedApiKeys = async (): Promise<Array<ManagedApiKey>> => {
  try {
    const raw = await fs.readFile(PATHS.API_KEYS_PATH)
    const parsed: unknown = JSON.parse(raw.toString("utf8"))
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item) => isManagedApiKey(item))
  } catch {
    return []
  }
}

const writeManagedApiKeys = async (
  keys: Array<ManagedApiKey>,
): Promise<void> => {
  const tempPath = `${PATHS.API_KEYS_PATH}.${randomUUID()}.tmp`
  await fs.mkdir(path.dirname(PATHS.API_KEYS_PATH), { recursive: true })
  await fs.writeFile(tempPath, JSON.stringify(keys, null, 2))
  await fs.rename(tempPath, PATHS.API_KEYS_PATH)
  await fs.chmod(PATHS.API_KEYS_PATH, 0o600)
}

const formatPrefix = (token: string): string => {
  if (token.length <= 8) {
    return "*".repeat(Math.max(1, token.length))
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

export const listManagedApiKeys = async (): Promise<
  Array<ManagedApiKeyListItem>
> => {
  const keys = await readManagedApiKeys()
  return keys.map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    prefix: formatPrefix(item.key),
  }))
}

export const getManagedApiKeyById = async (
  id: string,
): Promise<ManagedApiKey | undefined> => {
  const normalizedId = normalizeKeyId(id)
  const keys = await readManagedApiKeys()
  return keys.find((item) => item.id === normalizedId)
}

export const createManagedApiKey = async (
  id: string,
): Promise<ManagedApiKey> => {
  const normalizedId = normalizeKeyId(id)
  if (!normalizedId || !KEY_ID_PATTERN.test(normalizedId)) {
    throw new ManagedApiKeyError(
      "invalid-id",
      "Invalid key name. Use letters, numbers, dot, underscore, or hyphen.",
    )
  }

  const key = `cpk_${randomBytes(24).toString("base64url")}`

  const current = await readManagedApiKeys()
  if (current.some((item) => item.id === normalizedId)) {
    throw new ManagedApiKeyError("duplicate-id", "Key name already exists")
  }

  const item: ManagedApiKey = {
    id: normalizedId,
    key,
    createdAt: new Date().toISOString(),
  }

  await writeManagedApiKeys([...current, item])
  return item
}

export const deleteManagedApiKey = async (id: string): Promise<boolean> => {
  const current = await readManagedApiKeys()
  const next = current.filter((item) => item.id !== id)

  if (next.length === current.length) {
    return false
  }

  await writeManagedApiKeys(next)
  return true
}

export const getApiTokens = async (): Promise<Array<string>> => {
  const envTokens = parseEnvTokens(process.env[API_TOKEN_ENV])
  const managedKeys = await readManagedApiKeys()

  return [...new Set([...envTokens, ...managedKeys.map((item) => item.key)])]
}

export const getPrimaryApiToken = async (): Promise<string | undefined> => {
  const tokens = await getApiTokens()
  return tokens[0]
}
