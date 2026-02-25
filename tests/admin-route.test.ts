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
})
