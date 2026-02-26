import type { Context } from "hono"

import consola from "consola"
import { streamSSE, type SSEMessage } from "hono/streaming"

import { awaitApproval } from "~/lib/approval"
import { recordAuditSafely } from "~/lib/audit"
import { HTTPError } from "~/lib/error"
import { getManagedKeyId } from "~/lib/managed-key"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"
import { isNullish } from "~/lib/utils"
import {
  createChatCompletions,
  type ChatCompletionChunk,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
} from "~/services/copilot/create-chat-completions"

type StreamToolCall = { id?: string; name?: string; arguments: string }

type StreamSummary = {
  content: string
  toolCalls: Map<number, StreamToolCall>
  tokenUsage: number | null
  inputTokens: number | null
  outputTokens: number | null
}

const createStreamSummary = (): StreamSummary => ({
  content: "",
  toolCalls: new Map(),
  tokenUsage: null,
  inputTokens: null,
  outputTokens: null,
})

const applyChunkToSummary = (
  summary: StreamSummary,
  chunk: ChatCompletionChunk,
): void => {
  if (chunk.usage) {
    summary.tokenUsage = chunk.usage.total_tokens
    summary.inputTokens = chunk.usage.prompt_tokens
    summary.outputTokens = chunk.usage.completion_tokens
  }
  for (const choice of chunk.choices) {
    const { delta } = choice
    if (delta.content) {
      summary.content += delta.content
    }

    if (!delta.tool_calls) {
      continue
    }

    for (const toolCall of delta.tool_calls) {
      const index = toolCall.index
      const current = summary.toolCalls.get(index) ?? { arguments: "" }
      summary.toolCalls.set(index, {
        id: toolCall.id ?? current.id,
        name: toolCall.function?.name ?? current.name,
        arguments: current.arguments + (toolCall.function?.arguments ?? ""),
      })
    }
  }
}

const buildStreamResponse = (summary: StreamSummary) => ({
  streamed: true,
  content: summary.content,
  toolCalls: Array.from(summary.toolCalls.values()),
  tokenUsage: summary.tokenUsage,
  inputTokens: summary.inputTokens,
  outputTokens: summary.outputTokens,
})

const streamChatResponse = (
  c: Context,
  options: {
    response: AsyncIterable<{ data?: string | Promise<string> }>
    requestPayload: ChatCompletionsPayload
    managedKeyId: string | null
    startedAt: number
  },
): Response => {
  const summary = createStreamSummary()
  return streamSSE(c, async (stream) => {
    try {
      for await (const chunk of options.response) {
        consola.debug("Streaming chunk:", JSON.stringify(chunk))
        const data = await Promise.resolve(chunk.data ?? "")
        if (data && data !== "[DONE]") {
          const completionChunk = JSON.parse(data) as ChatCompletionChunk
          applyChunkToSummary(summary, completionChunk)
        }
        await stream.writeSSE(chunk as SSEMessage)
      }
    } finally {
      await recordAuditSafely(options.managedKeyId, {
        path: c.req.path,
        method: c.req.method,
        status: 200,
        durationMs: Date.now() - options.startedAt,
        tokenUsage: summary.tokenUsage,
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
        request: options.requestPayload,
        response: buildStreamResponse(summary),
      })
    }
  })
}

// eslint-disable-next-line complexity
export async function handleCompletion(c: Context) {
  const managedKeyId = getManagedKeyId(c)
  const startedAt = Date.now()
  let payload: ChatCompletionsPayload | null = null

  try {
    await checkRateLimit(state)

    let requestPayload = await c.req.json<ChatCompletionsPayload>()
    payload = requestPayload
    consola.debug(
      "Request payload:",
      JSON.stringify(requestPayload).slice(-400),
    )

    // Find the selected model
    const selectedModel = state.models?.data.find(
      (model) => model.id === requestPayload.model,
    )

    // Calculate and display token count
    try {
      if (selectedModel) {
        const tokenCount = await getTokenCount(requestPayload, selectedModel)
        consola.info("Current token count:", tokenCount)
      } else {
        consola.warn("No model selected, skipping token count calculation")
      }
    } catch (error) {
      consola.warn("Failed to calculate token count:", error)
    }

    if (state.manualApprove) await awaitApproval()

    if (isNullish(requestPayload.max_tokens)) {
      requestPayload = {
        ...requestPayload,
        max_tokens: selectedModel?.capabilities.limits.max_output_tokens,
      }
      consola.debug(
        "Set max_tokens to:",
        JSON.stringify(requestPayload.max_tokens),
      )
    }

    const response = await createChatCompletions(requestPayload)

    if (isNonStreaming(response)) {
      consola.debug("Non-streaming response:", JSON.stringify(response))
      await recordAuditSafely(managedKeyId, {
        path: c.req.path,
        method: c.req.method,
        status: 200,
        durationMs: Date.now() - startedAt,
        tokenUsage: response.usage?.total_tokens ?? null,
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
        request: requestPayload,
        response,
      })
      return c.json(response)
    }

    consola.debug("Streaming response")
    return streamChatResponse(c, {
      response,
      requestPayload,
      managedKeyId,
      startedAt,
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error"
    await recordAuditSafely(managedKeyId, {
      path: c.req.path,
      method: c.req.method,
      status: error instanceof HTTPError ? error.response.status : 500,
      durationMs: Date.now() - startedAt,
      request: payload,
      response: null,
      error: errorMessage,
    })
    throw error
  }
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")
