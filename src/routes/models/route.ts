import { Hono } from "hono"

import { recordAuditSafely } from "~/lib/audit"
import { HTTPError, forwardError } from "~/lib/error"
import { getManagedKeyId } from "~/lib/managed-key"
import { state } from "~/lib/state"
import { cacheModels } from "~/lib/utils"

export const modelRoutes = new Hono()

modelRoutes.get("/", async (c) => {
  const managedKeyId = getManagedKeyId(c)
  const startedAt = Date.now()

  try {
    if (!state.models) {
      // This should be handled by startup logic, but as a fallback.
      await cacheModels()
    }

    const models = state.models?.data.map((model) => ({
      id: model.id,
      object: "model",
      type: "model",
      created: 0, // No date available from source
      created_at: new Date(0).toISOString(), // No date available from source
      owned_by: model.vendor,
      display_name: model.name,
    }))

    const response = {
      object: "list",
      data: models,
      has_more: false,
    }

    await recordAuditSafely(managedKeyId, {
      path: c.req.path,
      method: c.req.method,
      status: 200,
      durationMs: Date.now() - startedAt,
      request: null,
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
      request: null,
      response: null,
      error: errorMessage,
    })
    return await forwardError(c, error)
  }
})
