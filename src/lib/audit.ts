import consola from "consola"

import { recordManagedApiKeyAudit } from "~/lib/api-key-store"

export const recordAuditSafely = async (
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
): Promise<void> => {
  if (!managedKeyId) {
    return
  }

  try {
    await recordManagedApiKeyAudit(managedKeyId, context)
  } catch (error) {
    consola.warn("[audit] failed to record audit", {
      keyId: managedKeyId,
      error,
    })
  }
}
