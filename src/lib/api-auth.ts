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

const extractApiKey = (apiKey: string | undefined): string | null => {
  if (!apiKey) return null
  const trimmed = apiKey.trim()
  return trimmed.length > 0 ? trimmed : null
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

    const bearerToken = extractBearerToken(c.req.header("authorization"))
    const apiKey = extractApiKey(c.req.header("x-api-key"))

    if (bearerToken && apiKey && bearerToken !== apiKey) {
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Conflicting API tokens" }, 401)
    }

    const providedTokens = [bearerToken, apiKey].filter(
      (value): value is string => Boolean(value),
    )

    if (providedTokens.length === 0) {
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Missing API token" }, 401)
    }

    const isValid = providedTokens.some((token) => tokens.includes(token))
    if (!isValid) {
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Invalid API token" }, 401)
    }

    return next()
  }
}
