import consola from "consola"

import { recordManagedApiKeyAudit } from "~/lib/api-key-store"

const MAX_AUDIT_SIZE = 10 * 1024
const AUDIT_ENABLED = process.env.CHE_AUDIT_ENABLED === "true"

function truncateForAudit(value: unknown, maxSize = MAX_AUDIT_SIZE): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === "string") {
    return value.length > maxSize ?
        `${value.slice(0, maxSize)}... [truncated]`
      : value
  }

  const serialized = JSON.stringify(value)
  if (serialized.length > maxSize) {
    const truncated = serialized.slice(0, maxSize)
    try {
      return JSON.parse(`${truncated}}"error":"truncated"}`)
    } catch {
      return `${truncated}... [truncated]`
    }
  }

  return value
}

export const recordAuditSafely = (
  managedKeyId: string | null | undefined,
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
): void => {
  if (!AUDIT_ENABLED) {
    return
  }

  if (!managedKeyId) {
    return
  }

  const truncatedContext = {
    ...context,
    request: truncateForAudit(context.request),
    response: truncateForAudit(context.response),
  }

  recordManagedApiKeyAudit(managedKeyId, truncatedContext).catch(
    (error: unknown) => {
      consola.warn("[audit] failed to record audit (non-blocking)", {
        keyId: managedKeyId,
        error: error instanceof Error ? error.message : String(error),
      })
    },
  )
}
