import { Hono } from "hono"

import { recordAuditSafely } from "~/lib/audit"
import { HTTPError, forwardError } from "~/lib/error"
import { getManagedKeyId } from "~/lib/managed-key"
import {
  createEmbeddings,
  type EmbeddingRequest,
} from "~/services/copilot/create-embeddings"

export const embeddingRoutes = new Hono()

embeddingRoutes.post("/", async (c) => {
  const managedKeyId = getManagedKeyId(c)
  const startedAt = Date.now()
  let payload: EmbeddingRequest | null = null

  try {
    payload = await c.req.json<EmbeddingRequest>()
    const response = await createEmbeddings(payload)

    await recordAuditSafely(managedKeyId, {
      path: c.req.path,
      method: c.req.method,
      status: 200,
      durationMs: Date.now() - startedAt,
      tokenUsage: response.usage.total_tokens,
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.total_tokens - response.usage.prompt_tokens,
      request: payload,
      response,
    })

    return c.json(response)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error"
    await recordAuditSafely(managedKeyId, {
      path: c.req.path,
      method: c.req.method,
      status: error instanceof HTTPError ? error.response.status : 500,
      durationMs: Date.now() - startedAt,
      request: payload,
      response: null,
      error: errorMessage,
    })
    return await forwardError(c, error)
  }
})
