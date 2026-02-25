import { afterEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import { createApiKeyAuthMiddleware } from "../src/lib/api-auth"

const originalApiToken = process.env.COPILOT_API_TOKEN

afterEach(() => {
  if (originalApiToken === undefined) {
    delete process.env.COPILOT_API_TOKEN
  } else {
    process.env.COPILOT_API_TOKEN = originalApiToken
  }
})

const createApp = () => {
  const app = new Hono()
  app.use(createApiKeyAuthMiddleware())
  app.get("/v1/models", (c) => c.json({ ok: true }))
  app.get("/", (c) => c.text("ok"))
  return app
}

describe("createApiKeyAuthMiddleware", () => {
  test("rejects protected route when no token configured", async () => {
    delete process.env.COPILOT_API_TOKEN
    const app = createApp()

    const response = await app.request("http://localhost/v1/models")
    expect(response.status).toBe(401)
  })

  test("allows unprotected route when no token configured", async () => {
    delete process.env.COPILOT_API_TOKEN
    const app = createApp()

    const response = await app.request("http://localhost/")
    expect(response.status).toBe(200)
  })

  test("accepts request with valid bearer token", async () => {
    process.env.COPILOT_API_TOKEN = "token-a;token-b"
    const app = createApp()

    const response = await app.request("http://localhost/v1/models", {
      headers: {
        Authorization: "Bearer token-b",
      },
    })

    expect(response.status).toBe(200)
  })

  test("accepts request with valid x-api-key", async () => {
    process.env.COPILOT_API_TOKEN = "token-a;token-b"
    const app = createApp()

    const response = await app.request("http://localhost/v1/models", {
      headers: {
        "x-api-key": "token-a",
      },
    })

    expect(response.status).toBe(200)
  })

  test("rejects conflicting bearer and x-api-key", async () => {
    process.env.COPILOT_API_TOKEN = "token-a;token-b"
    const app = createApp()

    const response = await app.request("http://localhost/v1/models", {
      headers: {
        Authorization: "Bearer token-a",
        "x-api-key": "token-b",
      },
    })

    expect(response.status).toBe(401)
  })
})
