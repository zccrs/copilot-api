import type { MiddlewareHandler } from "hono"

import consola from "consola"

const API_TOKEN_ENV = "COPILOT_API_TOKEN"
const AUTH_CHALLENGE = 'Bearer realm="copilot-api"'

export const parseApiTokens = (raw: string | undefined): Array<string> =>
  raw
    ?.split(";")
    .map((token) => token.trim())
    .filter((token) => token.length > 0) ?? []

let hasLoggedApiTokens = false

export const getApiTokens = (): Array<string> => {
  const rawTokens = process.env[API_TOKEN_ENV]
  const tokens = parseApiTokens(rawTokens)

  if (!hasLoggedApiTokens) {
    hasLoggedApiTokens = true
    if (rawTokens) {
      consola.info(
        `Loaded API tokens from ${API_TOKEN_ENV}: ${tokens.join(", ")}`,
      )
    } else {
      consola.info(`No API tokens found in ${API_TOKEN_ENV}`)
    }
  }

  return tokens
}

export const getPrimaryApiToken = (): string | undefined => getApiTokens()[0]

const extractBearerToken = (
  authorization: string | undefined,
): string | null => {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(\S+)$/i)
  const token = match ? match[1].trim() : null
  return token && token.length > 0 ? token : null
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

    const rawApiKey = c.req.header("x-api-key")
    const bearerToken = extractBearerToken(c.req.header("authorization"))
    const apiKey = extractApiKey(rawApiKey)
    const shouldLogApiKey =
      c.req.path === "/models" || c.req.path === "/v1/models"

    if (bearerToken && apiKey && bearerToken !== apiKey) {
      if (shouldLogApiKey) {
        consola.info("Auth failed for models request, x-api-key:", rawApiKey)
      }
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Conflicting API tokens" }, 401)
    }

    const token = bearerToken ?? apiKey
    if (!token) {
      if (shouldLogApiKey) {
        consola.info("Auth failed for models request, x-api-key:", rawApiKey)
      }
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Missing API token" }, 401)
    }

    if (!tokens.includes(token)) {
      if (shouldLogApiKey) {
        consola.info("Auth failed for models request, x-api-key:", rawApiKey)
      }
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Invalid API token" }, 401)
    }

    return next()
  }
}
