import consola from "consola"

const MAX_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 5000
const REQUEST_TIMEOUT_MS = 120000
const MAX_REQUEST_SIZE = 100 * 1024

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const isEOFError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes("unexpected eof")
      || message.includes("eof")
      || message.includes("socket hang up")
      || message.includes("connection reset")
      || message.includes("broken pipe")
    )
  }
  return false
}

const shouldRetry = (error: unknown, attempt: number): boolean => {
  if (attempt >= MAX_RETRIES) {
    return false
  }

  if (isEOFError(error)) {
    return true
  }

  return true
}

const calculateDelay = (attempt: number, isEOF: boolean): number => {
  const baseDelay = isEOF ? BASE_DELAY_MS * 2 : BASE_DELAY_MS
  return Math.min(baseDelay * 2 ** attempt, MAX_DELAY_MS)
}

export class CopilotAPIError extends Error {
  cause?: unknown
  isRetryable: boolean

  constructor(message: string, cause?: unknown, isRetryable = false) {
    super(message)
    this.name = "CopilotAPIError"
    this.cause = cause
    this.isRetryable = isRetryable
  }
}

export async function copilotFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) {
  let attempt = 0
  let lastError: unknown

  while (true) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)

    try {
      if (init?.body) {
        const bodySize = new TextEncoder().encode(init.body as string).length
        if (bodySize > MAX_REQUEST_SIZE) {
          consola.warn(
            `[copilot-fetch] Large request detected: ${Math.round(bodySize / 1024)}KB. This may cause connection issues.`,
          )
        }
      }

      consola.debug(`[copilot-fetch] Attempt ${attempt + 1}/${MAX_RETRIES}`)

      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok && response.status >= 500) {
        throw new CopilotAPIError(
          `Server error: ${response.status} ${response.statusText}`,
          response,
          true,
        )
      }

      return response
    } catch (error) {
      clearTimeout(timeoutId)
      lastError = error

      const isEOF = isEOFError(error)
      const isTimeout = error instanceof Error && error.name === "AbortError"

      let errorMessage = error instanceof Error ? error.message : String(error)

      if (isEOF) {
        errorMessage = `Connection unexpectedly closed (unexpected EOF). This may be caused by:\n  - Request content too large\n  - GitHub Copilot server timeout\n  - Network instability\n  - Rate limiting`
      } else if (isTimeout) {
        errorMessage = `Request timeout after ${REQUEST_TIMEOUT_MS / 1000}s. The request may be too large or the server is slow to respond.`
      }

      if (!shouldRetry(error, attempt)) {
        consola.error(
          `[copilot-fetch] All retries exhausted. Last error:`,
          errorMessage,
        )
        throw new CopilotAPIError(
          `Failed after ${MAX_RETRIES} attempts. Last error: ${errorMessage}`,
          lastError,
          false,
        )
      }

      const delay = calculateDelay(attempt, isEOF)
      let errorType: string
      if (isEOF) {
        errorType = "EOF error"
      } else if (isTimeout) {
        errorType = "Timeout"
      } else {
        errorType = errorMessage
      }
      consola.warn(
        `[copilot-fetch] Request failed (attempt ${attempt + 1}):`,
        errorType,
      )
      consola.warn(`[copilot-fetch] Retrying in ${delay}ms...`)

      attempt += 1
      await wait(delay)
    }
  }
}
