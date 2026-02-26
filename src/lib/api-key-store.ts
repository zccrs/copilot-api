import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { PATHS } from "~/lib/paths"

const API_TOKEN_ENV = "COPILOT_API_TOKEN"
const KEY_ID_PATTERN = /^[\w.-]+$/

export class ManagedApiKeyError extends Error {
  code: "duplicate-id" | "invalid-id" | "invalid-limit" | "invalid-expiration"

  constructor(
    code:
      | "duplicate-id"
      | "invalid-id"
      | "invalid-limit"
      | "invalid-expiration",
    message: string,
  ) {
    super(message)
    this.code = code
  }
}

export interface ManagedApiKey {
  id: string
  key: string
  createdAt: string
  totalLimit: number | null
  dailyLimit: number | null
  expiresAt: string | null
}

export interface ManagedApiKeyListItem {
  id: string
  prefix: string
  createdAt: string
  totalLimit: number | null
  dailyLimit: number | null
  expiresAt: string | null
}

export interface ManagedApiKeyUsageRecord {
  keyId: string
  timestamp: string
  path: string
  method: string
  status: number
}

export interface ManagedApiKeyUsageSummary {
  total: number
  daily: number
}

export interface ManagedApiKeyAuditRecord {
  id: string
  keyId: string
  timestamp: string
  path: string
  method: string
  status: number
  durationMs: number
  tokenUsage: number | null
  inputTokens: number | null
  outputTokens: number | null
  request: unknown
  response: unknown
  error: string | null
}

export interface ManagedApiKeyAuditPage {
  keyId: string
  page: number
  pageSize: number
  total: number
  pages: number
  items: Array<ManagedApiKeyAuditRecord>
}

interface CreateManagedApiKeyOptions {
  totalLimit?: number | null
  dailyLimit?: number | null
  expiresAt?: string | null
}

export interface UpdateManagedApiKeySettingsOptions {
  totalLimit?: number | null
  dailyLimit?: number | null
  expiresAt?: string | null
}

const normalizeKeyId = (id: string): string => id.trim()

const normalizeLimit = (
  value: number | null | undefined,
  fieldName: "totalLimit" | "dailyLimit",
): number | null => {
  if (value === undefined || value === null) {
    return null
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new ManagedApiKeyError(
      "invalid-limit",
      `${fieldName} must be a non-negative integer`,
    )
  }

  return value
}

const normalizeExpiresAt = (
  value: string | null | undefined,
): string | null => {
  if (value === undefined || value === null || value.trim() === "") {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new ManagedApiKeyError(
      "invalid-expiration",
      "expiresAt must be a valid datetime",
    )
  }

  return parsed.toISOString()
}

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
    && (candidate.totalLimit === undefined
      || candidate.totalLimit === null
      || Number.isInteger(candidate.totalLimit))
    && (candidate.dailyLimit === undefined
      || candidate.dailyLimit === null
      || Number.isInteger(candidate.dailyLimit))
    && (candidate.expiresAt === undefined
      || candidate.expiresAt === null
      || typeof candidate.expiresAt === "string")
  )
}

const isUsageRecord = (value: unknown): value is ManagedApiKeyUsageRecord => {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<ManagedApiKeyUsageRecord>
  return (
    typeof candidate.keyId === "string"
    && typeof candidate.timestamp === "string"
    && typeof candidate.path === "string"
    && typeof candidate.method === "string"
    && Number.isInteger(candidate.status)
  )
}

const isAuditRecord = (value: unknown): value is ManagedApiKeyAuditRecord => {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<ManagedApiKeyAuditRecord>
  const isTokenUsageValid =
    candidate.tokenUsage === undefined
    || candidate.tokenUsage === null
    || Number.isInteger(candidate.tokenUsage)
  const isInputTokensValid =
    candidate.inputTokens === undefined
    || candidate.inputTokens === null
    || Number.isInteger(candidate.inputTokens)
  const isOutputTokensValid =
    candidate.outputTokens === undefined
    || candidate.outputTokens === null
    || Number.isInteger(candidate.outputTokens)
  const conditions = [
    typeof candidate.id === "string",
    typeof candidate.keyId === "string",
    typeof candidate.timestamp === "string",
    typeof candidate.path === "string",
    typeof candidate.method === "string",
    Number.isInteger(candidate.status),
    Number.isFinite(candidate.durationMs ?? Number.NaN),
    isTokenUsageValid,
    isInputTokensValid,
    isOutputTokensValid,
    Object.hasOwn(candidate, "request"),
    Object.hasOwn(candidate, "response"),
    candidate.error === null || typeof candidate.error === "string",
  ]
  return conditions.every(Boolean)
}

const readManagedApiKeys = async (): Promise<Array<ManagedApiKey>> => {
  try {
    const raw = await fs.readFile(PATHS.API_KEYS_PATH)
    const parsed: unknown = JSON.parse(raw.toString("utf8"))
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item) => isManagedApiKey(item))
      .map((item) => ({
        ...item,
        totalLimit: item.totalLimit ?? null,
        dailyLimit: item.dailyLimit ?? null,
        expiresAt: item.expiresAt ?? null,
      }))
  } catch {
    return []
  }
}

const readUsageRecords = async (): Promise<Array<ManagedApiKeyUsageRecord>> => {
  try {
    const raw = await fs.readFile(PATHS.API_KEY_USAGE_PATH)
    const parsed: unknown = JSON.parse(raw.toString("utf8"))
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item) => isUsageRecord(item))
  } catch {
    return []
  }
}

const readAuditRecords = async (): Promise<Array<ManagedApiKeyAuditRecord>> => {
  try {
    const raw = await fs.readFile(PATHS.API_KEY_AUDIT_PATH)
    const parsed: unknown = JSON.parse(raw.toString("utf8"))
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item) => isAuditRecord(item))
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

const writeUsageRecords = async (
  records: Array<ManagedApiKeyUsageRecord>,
): Promise<void> => {
  const tempPath = `${PATHS.API_KEY_USAGE_PATH}.${randomUUID()}.tmp`
  await fs.mkdir(path.dirname(PATHS.API_KEY_USAGE_PATH), { recursive: true })
  await fs.writeFile(tempPath, JSON.stringify(records, null, 2))
  await fs.rename(tempPath, PATHS.API_KEY_USAGE_PATH)
  await fs.chmod(PATHS.API_KEY_USAGE_PATH, 0o600)
}

const writeAuditRecords = async (
  records: Array<ManagedApiKeyAuditRecord>,
): Promise<void> => {
  const tempPath = `${PATHS.API_KEY_AUDIT_PATH}.${randomUUID()}.tmp`
  await fs.mkdir(path.dirname(PATHS.API_KEY_AUDIT_PATH), { recursive: true })
  await fs.writeFile(tempPath, JSON.stringify(records, null, 2))
  await fs.rename(tempPath, PATHS.API_KEY_AUDIT_PATH)
  await fs.chmod(PATHS.API_KEY_AUDIT_PATH, 0o600)
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
    totalLimit: item.totalLimit,
    dailyLimit: item.dailyLimit,
    expiresAt: item.expiresAt,
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
  options?: CreateManagedApiKeyOptions,
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

  const totalLimit = normalizeLimit(options?.totalLimit, "totalLimit")
  const dailyLimit = normalizeLimit(options?.dailyLimit, "dailyLimit")
  const expiresAt = normalizeExpiresAt(options?.expiresAt)

  const item: ManagedApiKey = {
    id: normalizedId,
    key,
    createdAt: new Date().toISOString(),
    totalLimit,
    dailyLimit,
    expiresAt,
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

export const updateManagedApiKeySettings = async (
  id: string,
  options: UpdateManagedApiKeySettingsOptions,
): Promise<ManagedApiKey | undefined> => {
  const normalizedId = normalizeKeyId(id)
  const current = await readManagedApiKeys()
  const index = current.findIndex((item) => item.id === normalizedId)
  if (index === -1) {
    return undefined
  }

  const updated: ManagedApiKey = {
    ...current[index],
    totalLimit: normalizeLimit(options.totalLimit, "totalLimit"),
    dailyLimit: normalizeLimit(options.dailyLimit, "dailyLimit"),
    expiresAt: normalizeExpiresAt(options.expiresAt),
  }

  current[index] = updated
  await writeManagedApiKeys(current)
  return updated
}

export const getApiTokens = async (): Promise<Array<string>> => {
  const envTokens = parseEnvTokens(process.env[API_TOKEN_ENV])
  const managedKeys = await readManagedApiKeys()

  return [...new Set([...envTokens, ...managedKeys.map((item) => item.key)])]
}

export const getManagedApiKeyByToken = async (
  token: string,
): Promise<ManagedApiKey | undefined> => {
  const managedKeys = await readManagedApiKeys()
  return managedKeys.find((item) => item.key === token)
}

const isWithinRange = (timestamp: string, from: Date, to: Date): boolean => {
  const current = new Date(timestamp).getTime()
  return current >= from.getTime() && current <= to.getTime()
}

const startOfLocalDay = (reference: Date): Date => {
  const day = new Date(reference)
  day.setHours(0, 0, 0, 0)
  return day
}

export const getManagedApiKeyUsageByRange = async (
  keyId: string,
  from: Date,
  to: Date,
): Promise<Array<ManagedApiKeyUsageRecord>> => {
  const records = await readUsageRecords()
  return records.filter(
    (item) => item.keyId === keyId && isWithinRange(item.timestamp, from, to),
  )
}

export const getManagedApiKeyUsageSummary = async (
  keyId: string,
  referenceDate = new Date(),
): Promise<ManagedApiKeyUsageSummary> => {
  const records = await readUsageRecords()
  const ownRecords = records.filter((item) => item.keyId === keyId)
  const dayStart = startOfLocalDay(referenceDate)

  return {
    total: ownRecords.length,
    daily: ownRecords.filter((item) => new Date(item.timestamp) >= dayStart)
      .length,
  }
}

export const recordManagedApiKeyUsage = async (
  keyId: string,
  context: {
    path: string
    method: string
    status: number
  },
): Promise<void> => {
  const records = await readUsageRecords()
  records.push({
    keyId,
    timestamp: new Date().toISOString(),
    path: context.path,
    method: context.method,
    status: context.status,
  })

  await writeUsageRecords(records)
}

export const recordManagedApiKeyAudit = async (
  keyId: string,
  context: {
    path: string
    method: string
    status: number
    durationMs: number
    tokenUsage?: number | null
    inputTokens?: number | null
    outputTokens?: number | null
    request: unknown
    response: unknown
    error?: string | null
  },
): Promise<void> => {
  const records = await readAuditRecords()
  records.push({
    id: randomUUID(),
    keyId,
    timestamp: new Date().toISOString(),
    path: context.path,
    method: context.method,
    status: context.status,
    durationMs: context.durationMs,
    tokenUsage: context.tokenUsage ?? null,
    inputTokens: context.inputTokens ?? null,
    outputTokens: context.outputTokens ?? null,
    request: context.request,
    response: context.response,
    error: context.error ?? null,
  })

  await writeAuditRecords(records)
}

export const getManagedApiKeyAuditPage = async (
  keyId: string,
  options: {
    from?: Date
    to?: Date
    query?: string
    page: number
    pageSize: number
  },
): Promise<ManagedApiKeyAuditPage> => {
  const records = await readAuditRecords()
  const query = options.query?.trim().toLowerCase()
  const fromTs = options.from?.getTime()
  const toTs = options.to?.getTime()

  const filtered = records.filter((record) => {
    if (record.keyId !== keyId) {
      return false
    }

    const recordTs = new Date(record.timestamp).getTime()
    if (typeof fromTs === "number" && recordTs < fromTs) {
      return false
    }
    if (typeof toTs === "number" && recordTs > toTs) {
      return false
    }

    if (!query) {
      return true
    }

    const searchText = [
      record.path,
      record.method,
      String(record.status),
      record.inputTokens === null ? "" : String(record.inputTokens),
      record.outputTokens === null ? "" : String(record.outputTokens),
      record.tokenUsage === null ? "" : String(record.tokenUsage),
      record.error ?? "",
      JSON.stringify(record.request ?? ""),
      JSON.stringify(record.response ?? ""),
    ]
      .join(" ")
      .toLowerCase()

    return searchText.includes(query)
  })

  filtered.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )

  const total = filtered.length
  const pageSize = Math.max(1, options.pageSize)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, options.page), pages)
  const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  return {
    keyId,
    page,
    pageSize,
    total,
    pages,
    items,
  }
}

export const getPrimaryApiToken = async (): Promise<string | undefined> => {
  const tokens = await getApiTokens()
  return tokens[0]
}
