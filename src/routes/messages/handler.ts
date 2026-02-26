import type { Context } from "hono"

import consola from "consola"
import { streamSSE } from "hono/streaming"

import { awaitApproval } from "~/lib/approval"
import { recordAuditSafely } from "~/lib/audit"
import { HTTPError } from "~/lib/error"
import { getManagedKeyId } from "~/lib/managed-key"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import {
  createChatCompletions,
  type ChatCompletionChunk,
  type ChatCompletionResponse,
} from "~/services/copilot/create-chat-completions"

import {
  type AnthropicMessagesPayload,
  type AnthropicStreamState,
} from "./anthropic-types"
import {
  translateToAnthropic,
  translateToOpenAI,
} from "./non-stream-translation"
import { translateChunkToAnthropicEvents } from "./stream-translation"

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

const streamAnthropicResponse = (
  c: Context,
  options: {
    response: AsyncIterable<{ data?: string }>
    requestPayload: AnthropicMessagesPayload
    managedKeyId: string | null
    startedAt: number
  },
): Response => {
  const summary = createStreamSummary()
  return streamSSE(c, async (stream) => {
    const streamState: AnthropicStreamState = {
      messageStartSent: false,
      contentBlockIndex: 0,
      contentBlockOpen: false,
      toolCalls: {},
    }

    try {
      for await (const rawEvent of options.response) {
        consola.debug("Copilot raw stream event:", JSON.stringify(rawEvent))
        if (!rawEvent.data) {
          continue
        }
        if (rawEvent.data === "[DONE]") {
          break
        }

        const chunk = JSON.parse(rawEvent.data) as ChatCompletionChunk
        applyChunkToSummary(summary, chunk)

        const events = translateChunkToAnthropicEvents(chunk, streamState)
        for (const event of events) {
          consola.debug("Translated Anthropic event:", JSON.stringify(event))
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          })
        }
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

export async function handleCompletion(c: Context) {
  const managedKeyId = getManagedKeyId(c)
  const startedAt = Date.now()
  let anthropicPayload: AnthropicMessagesPayload | null = null

  try {
    await checkRateLimit(state)

    const requestPayload = await c.req.json<AnthropicMessagesPayload>()
    anthropicPayload = requestPayload
    consola.debug("Anthropic request payload:", JSON.stringify(requestPayload))

    const openAIPayload = translateToOpenAI(requestPayload)
    consola.debug(
      "Translated OpenAI request payload:",
      JSON.stringify(openAIPayload),
    )

    if (state.manualApprove) {
      await awaitApproval()
    }

    const response = await createChatCompletions(openAIPayload)

    if (isNonStreaming(response)) {
      consola.debug(
        "Non-streaming response from Copilot:",
        JSON.stringify(response).slice(-400),
      )
      const anthropicResponse = translateToAnthropic(response)
      consola.debug(
        "Translated Anthropic response:",
        JSON.stringify(anthropicResponse),
      )
      await recordAuditSafely(managedKeyId, {
        path: c.req.path,
        method: c.req.method,
        status: 200,
        durationMs: Date.now() - startedAt,
        tokenUsage:
          anthropicResponse.usage.input_tokens
          + anthropicResponse.usage.output_tokens,
        inputTokens: anthropicResponse.usage.input_tokens,
        outputTokens: anthropicResponse.usage.output_tokens,
        request: requestPayload,
        response: anthropicResponse,
      })
      return c.json(anthropicResponse)
    }

    consola.debug("Streaming response from Copilot")
    return streamAnthropicResponse(c, {
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
      request: anthropicPayload,
      response: null,
      error: errorMessage,
    })
    throw error
  }
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")
