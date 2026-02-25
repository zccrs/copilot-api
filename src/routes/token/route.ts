import { Hono } from "hono"

import { requireAdminAuth } from "~/lib/admin-auth"
import { state } from "~/lib/state"

export const tokenRoute = new Hono()

tokenRoute.use("*", requireAdminAuth())

tokenRoute.get("/", (c) => {
  try {
    return c.json({
      token: state.copilotToken,
    })
  } catch (error) {
    console.error("Error fetching token:", error)
    return c.json({ error: "Failed to fetch token", token: null }, 500)
  }
})
