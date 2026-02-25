import type { Context, MiddlewareHandler } from "hono"

import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { createHmac, timingSafeEqual } from "node:crypto"

const SESSION_COOKIE_NAME = "copilot_admin_session"
const SESSION_TTL_SECONDS = 60 * 60 * 12

const ADMIN_USERNAME_ENV = "COPILOT_ADMIN_USERNAME"
const ADMIN_PASSWORD_ENV = "COPILOT_ADMIN_PASSWORD"

interface AdminCredentials {
  username: string
  password: string
}

const getAdminCredentials = (): AdminCredentials | null => {
  const rawUsername = process.env[ADMIN_USERNAME_ENV]
  const rawPassword = process.env[ADMIN_PASSWORD_ENV]
  const username = rawUsername?.trim() ?? ""
  const password = rawPassword ?? ""

  if (username === "" && password === "") {
    return null
  }

  return { username, password }
}

const buildSecret = (): string => {
  const credentials = getAdminCredentials()
  if (!credentials) {
    return "copilot-admin-default-secret"
  }

  return `${credentials.username}:${credentials.password}`
}

const signSessionPayload = (payload: string): string => {
  return createHmac("sha256", buildSecret()).update(payload).digest("hex")
}

const createSessionToken = (username: string): string => {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = `${username}:${expiresAt}`
  const signature = signSessionPayload(payload)
  return Buffer.from(`${payload}:${signature}`).toString("base64url")
}

const verifySessionToken = (token: string): boolean => {
  const credentials = getAdminCredentials()
  if (!credentials) {
    return false
  }

  let decoded: string
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8")
  } catch {
    return false
  }

  const [username, expiresRaw, signature] = decoded.split(":")
  if (!username || !expiresRaw || !signature) {
    return false
  }

  if (username !== credentials.username) {
    return false
  }

  const expiresAt = Number.parseInt(expiresRaw, 10)
  if (Number.isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false
  }

  const expectedSignature = signSessionPayload(`${username}:${expiresAt}`)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export const validateAdminCredentials = (
  username: string,
  password: string,
): boolean => {
  const credentials = getAdminCredentials()
  if (!credentials) {
    return true
  }

  return username === credentials.username && password === credentials.password
}

export const isAdminConfigured = (): boolean => getAdminCredentials() !== null

export const setAdminSession = (c: Context, username: string): void => {
  const token = createSessionToken(username)
  const isSecure = new URL(c.req.url).protocol === "https:"

  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  })
}

export const clearAdminSession = (c: Context): void => {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
  })
}

export const isAdminAuthenticated = (c: Context): boolean => {
  if (!isAdminConfigured()) {
    return true
  }
  const token = getCookie(c, SESSION_COOKIE_NAME)
  if (!token) {
    return false
  }

  return verifySessionToken(token)
}

export const requireAdminAuth = (): MiddlewareHandler => {
  return async (c, next) => {
    if (!isAdminConfigured()) {
      return next()
    }
    if (!isAdminAuthenticated(c)) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    return next()
  }
}
