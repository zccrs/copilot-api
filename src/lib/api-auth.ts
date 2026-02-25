import type { MiddlewareHandler } from "hono"

import consola from "consola"

import {
  getApiTokens,
  getManagedApiKeyByToken,
  getManagedApiKeyUsageSummary,
  type ManagedApiKey,
  recordManagedApiKeyUsage,
} from "~/lib/api-key-store"

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

const rejectRequest = (
  c: Parameters<MiddlewareHandler>[0],
  options: {
    reason: string
    error: string
    status: 401 | 429
    extra?: Record<string, unknown>
  },
): Response => {
  consola.warn("[api-auth] rejected request", {
    reason: options.reason,
    method: c.req.method,
    path: c.req.path,
    ...options.extra,
  })

  c.header("WWW-Authenticate", AUTH_CHALLENGE)
  return c.json({ error: options.error }, options.status)
}

const extractRequestToken = (
  c: Parameters<MiddlewareHandler>[0],
): { token: string | null; response?: Response } => {
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
    return {
      token: null,
      response: rejectRequest(c, {
        reason: "conflicting-token-headers",
        error: "Conflicting API tokens",
        status: 401,
      }),
    }
  }

  const token = bearerToken ?? apiKey
  if (!token) {
    return {
      token: null,
      response: rejectRequest(c, {
        reason: "missing-token",
        error: "Missing API token",
        status: 401,
      }),
    }
  }

  return { token }
}

const validateManagedKeyConstraints = async (
  c: Parameters<MiddlewareHandler>[0],
  managedKey: ManagedApiKey,
): Promise<Response | null> => {
  if (managedKey.expiresAt && new Date(managedKey.expiresAt) <= new Date()) {
    return rejectRequest(c, {
      reason: "expired-token",
      error: "API token expired",
      status: 401,
      extra: { keyId: managedKey.id },
    })
  }

  const usage = await getManagedApiKeyUsageSummary(managedKey.id)
  if (managedKey.totalLimit !== null && usage.total >= managedKey.totalLimit) {
    return rejectRequest(c, {
      reason: "total-limit-exceeded",
      error: "API token total limit exceeded",
      status: 429,
      extra: {
        keyId: managedKey.id,
        totalLimit: managedKey.totalLimit,
        totalUsage: usage.total,
      },
    })
  }

  if (managedKey.dailyLimit !== null && usage.daily >= managedKey.dailyLimit) {
    return rejectRequest(c, {
      reason: "daily-limit-exceeded",
      error: "API token daily limit exceeded",
      status: 429,
      extra: {
        keyId: managedKey.id,
        dailyLimit: managedKey.dailyLimit,
        dailyUsage: usage.daily,
      },
    })
  }

  return null
}

const recordUsageSafely = async (
  c: Parameters<MiddlewareHandler>[0],
  managedKey: ManagedApiKey | undefined,
): Promise<void> => {
  if (!managedKey) {
    return
  }

  try {
    await recordManagedApiKeyUsage(managedKey.id, {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
    })
  } catch (error) {
    consola.warn("[api-auth] failed to record usage", {
      keyId: managedKey.id,
      error,
    })
  }
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
      return rejectRequest(c, {
        reason: "no-configured-token",
        error: "API token is not configured",
        status: 401,
      })
    }

    const parsed = extractRequestToken(c)
    if (parsed.response) {
      return parsed.response
    }

    const token = parsed.token
    if (!token || !tokens.includes(token)) {
      return rejectRequest(c, {
        reason: "invalid-token",
        error: "Invalid API token",
        status: 401,
        extra: {
          providedToken: maskToken(token),
        },
      })
    }

    const managedKey = await getManagedApiKeyByToken(token)
    if (managedKey) {
      const rejected = await validateManagedKeyConstraints(c, managedKey)
      if (rejected) {
        return rejected
      }
    }

    consola.debug("[api-auth] request authorized", {
      token: maskToken(token),
    })

    await next()
    await recordUsageSafely(c, managedKey)
    return
  }
}
