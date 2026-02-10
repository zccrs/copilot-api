import { afterEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import { apiTokenAuth } from "~/lib/api-auth"

const originalToken = process.env.COPILOT_API_TOKEN

const setTokens = (value?: string) => {
  if (value === undefined) {
    delete process.env.COPILOT_API_TOKEN
    return
  }
  process.env.COPILOT_API_TOKEN = value
}

const createApp = () => {
  const app = new Hono()
  app.use(apiTokenAuth())
  app.get("/protected", (c) => c.json({ ok: true }))
  return app
}

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.COPILOT_API_TOKEN
  } else {
    process.env.COPILOT_API_TOKEN = originalToken
  }
})

describe("apiTokenAuth", () => {
  test("allows requests when no API token is configured", async () => {
    setTokens(undefined)
    const app = createApp()
    const response = await app.request("http://localhost/protected")
    expect(response.status).toBe(200)
  })

  test("rejects requests without authorization header", async () => {
    setTokens("token-a")
    const app = createApp()
    const response = await app.request("http://localhost/protected")
    expect(response.status).toBe(401)
  })

  test("rejects requests with invalid token", async () => {
    setTokens("token-a;token-b")
    const app = createApp()
    const response = await app.request("http://localhost/protected", {
      headers: { "x-api-key": "nope" },
    })
    expect(response.status).toBe(401)
  })

  test("accepts requests with valid token", async () => {
    setTokens("token-a ; token-b")
    const app = createApp()
    const response = await app.request("http://localhost/protected", {
      headers: { Authorization: "Bearer token-b" },
    })
    expect(response.status).toBe(200)
  })

  test("accepts requests with valid x-api-key", async () => {
    setTokens("token-a;token-b")
    const app = createApp()
    const response = await app.request("http://localhost/protected", {
      headers: { "x-api-key": "token-a" },
    })
    expect(response.status).toBe(200)
  })

  test("rejects requests with conflicting auth headers", async () => {
    setTokens("token-a;token-b")
    const app = createApp()
    const response = await app.request("http://localhost/protected", {
      headers: {
        Authorization: "Bearer token-a",
        "x-api-key": "token-b",
      },
    })
    expect(response.status).toBe(401)
  })
})
