import type { MiddlewareHandler } from "hono"

import consola from "consola"

import { getApiTokens } from "~/lib/api-key-store"

const AUTH_CHALLENGE = 'Bearer realm="copilot-api"'

const PROTECTED_PATHS = [
  "/chat/completions",
  "/models",
  "/embeddings",
  "/usage",
  "/token",
  "/v1/chat/completions",
  "/v1/models",
  "/v1/embeddings",
  "/v1/messages",
] as const

const isProtectedPath = (path: string): boolean =>
  PROTECTED_PATHS.some(
    (basePath) => path === basePath || path.startsWith(`${basePath}/`),
  )

const maskToken = (token: string | null): string => {
  if (!token) {
    return "<empty>"
  }

  if (token.length <= 8) {
    return "*".repeat(Math.max(1, token.length))
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

const extractBearerToken = (
  authorization: string | undefined,
): string | null => {
  if (!authorization) {
    return null
  }

  const prefix = "bearer "
  if (!authorization.toLowerCase().startsWith(prefix)) {
    return null
  }

  const token = authorization.slice(prefix.length).trim()
  return token.length > 0 ? token : null
}

const extractApiKey = (apiKey: string | undefined): string | null => {
  if (!apiKey) {
    return null
  }

  const trimmed = apiKey.trim()
  return trimmed.length > 0 ? trimmed : null
}

export const createApiKeyAuthMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const protectedPath = isProtectedPath(c.req.path)
    consola.debug("[api-auth] incoming request", {
      method: c.req.method,
      path: c.req.path,
      protectedPath,
    })

    if (c.req.method === "OPTIONS" || !protectedPath) {
      consola.debug("[api-auth] skipped auth", {
        reason: c.req.method === "OPTIONS" ? "options" : "unprotected-path",
      })
      return next()
    }

    const tokens = await getApiTokens()
    consola.debug("[api-auth] loaded configured tokens", {
      count: tokens.length,
    })

    if (tokens.length === 0) {
      consola.warn("[api-auth] rejected request", {
        reason: "no-configured-token",
        method: c.req.method,
        path: c.req.path,
      })
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "API token is not configured" }, 401)
    }

    const authorizationHeader =
      c.req.header("authorization") ?? c.req.header("Authorization")
    const apiKeyHeader = c.req.header("x-api-key") ?? c.req.header("X-API-Key")
    consola.debug("[api-auth] parsed headers", {
      hasAuthorizationHeader: Boolean(authorizationHeader),
      hasApiKeyHeader: Boolean(apiKeyHeader),
    })

    const bearerToken = extractBearerToken(authorizationHeader)
    const apiKey = extractApiKey(apiKeyHeader)
    consola.debug("[api-auth] extracted auth tokens", {
      bearerToken: maskToken(bearerToken),
      apiKey: maskToken(apiKey),
    })

    if (bearerToken && apiKey && bearerToken !== apiKey) {
      consola.warn("[api-auth] rejected request", {
        reason: "conflicting-token-headers",
        method: c.req.method,
        path: c.req.path,
      })
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Conflicting API tokens" }, 401)
    }

    const token = bearerToken ?? apiKey
    if (!token) {
      consola.warn("[api-auth] rejected request", {
        reason: "missing-token",
        method: c.req.method,
        path: c.req.path,
      })
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Missing API token" }, 401)
    }

    if (!tokens.includes(token)) {
      consola.warn("[api-auth] rejected request", {
        reason: "invalid-token",
        providedToken: maskToken(token),
        method: c.req.method,
        path: c.req.path,
      })
      c.header("WWW-Authenticate", AUTH_CHALLENGE)
      return c.json({ error: "Invalid API token" }, 401)
    }

    consola.debug("[api-auth] request authorized", {
      token: maskToken(token),
    })

    return next()
  }
}
