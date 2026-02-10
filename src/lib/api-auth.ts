import type { MiddlewareHandler } from "hono"

const API_TOKEN_ENV = "COPILOT_API_TOKEN"
const AUTH_CHALLENGE = 'Bearer realm="copilot-api"'

export const parseApiTokens = (raw: string | undefined): string[] =>
  raw
    ?.split(";")
    .map((token) => token.trim())
    .filter((token) => token.length > 0) ?? []

export const getApiTokens = (): string[] =>
  parseApiTokens(process.env[API_TOKEN_ENV])

export const getPrimaryApiToken = (): string | undefined =>
  getApiTokens()[0]

const extractBearerToken = (authorization: string | undefined): string | null => {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export const apiTokenAuth = (): MiddlewareHandler => {
  return async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return next()
    }

    const tokens = getApiTokens()
    if (tokens.length === 0) {
      return next()
    }

    const token = extractBearerToken(c.req.header("authorization"))
    if (!token) {
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Missing API token" }, 401)
    }

    if (!tokens.includes(token)) {
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Invalid API token" }, 401)
    }

    return next()
  }
}
