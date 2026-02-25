import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let tempDir = ""

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-api-test-"))
  process.env.COPILOT_API_DATA_DIR = tempDir
  process.env.COPILOT_API_KEYS_PATH = path.join(tempDir, "api_keys.json")
  process.env.COPILOT_ADMIN_USERNAME = "admin"
  process.env.COPILOT_ADMIN_PASSWORD = "secret"
})

afterAll(async () => {
  delete process.env.COPILOT_API_DATA_DIR
  delete process.env.COPILOT_API_KEYS_PATH
  delete process.env.COPILOT_ADMIN_USERNAME
  delete process.env.COPILOT_ADMIN_PASSWORD
  await fs.rm(tempDir, { recursive: true, force: true })
})

const createApp = async () => {
  const { adminRoutes } = await import("../src/routes/admin/route")
  const app = new Hono()
  app.route("/admin", adminRoutes)
  return app
}

const loginAsAdmin = async (app: Hono): Promise<string> => {
  const response = await app.request("http://localhost/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ username: "admin", password: "secret" }),
  })

  return response.headers.get("set-cookie") ?? ""
}

// eslint-disable-next-line max-lines-per-function
describe("adminRoutes", () => {
  test("allows login with configured credentials", async () => {
    const app = await createApp()

    const response = await app.request("http://localhost/admin/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ username: "admin", password: "secret" }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toContain(
      "copilot_admin_session=",
    )
  })

  test("rejects invalid credentials", async () => {
    const app = await createApp()

    const response = await app.request("http://localhost/admin/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    })

    expect(response.status).toBe(401)
  })

  test("rejects api-keys access without login", async () => {
    const app = await createApp()
    const response = await app.request("http://localhost/admin/api-keys")
    expect(response.status).toBe(401)
  })

  test("creates key with custom name and rejects duplicate", async () => {
    const app = await createApp()
    const cookie = await loginAsAdmin(app)
    const keyId = `my-client-${Date.now()}`

    const createResponse = await app.request(
      "http://localhost/admin/api-keys",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ id: keyId }),
      },
    )

    expect(createResponse.status).toBe(200)
    const created = (await createResponse.json()) as { id: string }
    expect(created.id).toBe(keyId)

    const duplicateResponse = await app.request(
      "http://localhost/admin/api-keys",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ id: keyId }),
      },
    )

    expect(duplicateResponse.status).toBe(409)
  })

  test("returns full key by custom id for copy action", async () => {
    const app = await createApp()
    const cookie = await loginAsAdmin(app)
    const keyId = `copyable-key-${Date.now()}`

    await app.request("http://localhost/admin/api-keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ id: keyId }),
    })

    const getResponse = await app.request(
      `http://localhost/admin/api-keys/${keyId}`,
      {
        headers: {
          Cookie: cookie,
        },
      },
    )

    expect(getResponse.status).toBe(200)
    const payload = (await getResponse.json()) as { id: string; key: string }
    expect(payload.id).toBe(keyId)
    expect(payload.key.startsWith("cpk_")).toBe(true)
  })

  test("creates key with limits and expiration", async () => {
    const app = await createApp()
    const cookie = await loginAsAdmin(app)
    const keyId = `limited-key-${Date.now()}`
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const createResponse = await app.request(
      "http://localhost/admin/api-keys",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({
          id: keyId,
          totalLimit: 100,
          dailyLimit: 10,
          expiresAt,
        }),
      },
    )

    expect(createResponse.status).toBe(200)

    const listResponse = await app.request("http://localhost/admin/api-keys", {
      headers: {
        Cookie: cookie,
      },
    })

    expect(listResponse.status).toBe(200)
    const listPayload = (await listResponse.json()) as {
      items: Array<{
        id: string
        totalLimit: number | null
        dailyLimit: number | null
        expiresAt: string | null
        totalUsage: number
      }>
    }

    const created = listPayload.items.find((item) => item.id === keyId)
    expect(created).toBeDefined()
    expect(created?.totalLimit).toBe(100)
    expect(created?.dailyLimit).toBe(10)
    expect(created?.expiresAt).toBe(expiresAt)
    expect(created?.totalUsage).toBe(0)
  })

  test("returns usage stats by time range", async () => {
    const app = await createApp()
    const cookie = await loginAsAdmin(app)
    const keyId = `usage-key-${Date.now()}`

    await app.request("http://localhost/admin/api-keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ id: keyId }),
    })

    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const usageResponse = await app.request(
      `http://localhost/admin/api-keys/${keyId}/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        headers: {
          Cookie: cookie,
        },
      },
    )

    expect(usageResponse.status).toBe(200)
    const payload = (await usageResponse.json()) as {
      keyId: string
      count: number
      totalUsage: number
      dailyUsage: number
      records: Array<unknown>
    }
    expect(payload.keyId).toBe(keyId)
    expect(payload.count).toBe(0)
    expect(payload.totalUsage).toBe(0)
    expect(payload.dailyUsage).toBe(0)
    expect(payload.records.length).toBe(0)
  })

  test("updates key settings from dedicated endpoint", async () => {
    const app = await createApp()
    const cookie = await loginAsAdmin(app)
    const keyId = `settings-key-${Date.now()}`

    await app.request("http://localhost/admin/api-keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ id: keyId }),
    })

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const updateResponse = await app.request(
      `http://localhost/admin/api-keys/${keyId}/settings`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({
          totalLimit: 200,
          dailyLimit: 20,
          expiresAt,
        }),
      },
    )

    expect(updateResponse.status).toBe(200)
    const updated = (await updateResponse.json()) as {
      totalLimit: number | null
      dailyLimit: number | null
      expiresAt: string | null
    }
    expect(updated.totalLimit).toBe(200)
    expect(updated.dailyLimit).toBe(20)
    expect(updated.expiresAt).toBe(expiresAt)
  })
})
