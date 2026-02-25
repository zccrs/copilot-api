const MAX_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 5000

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function githubFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) {
  let attempt = 0

  while (true) {
    try {
      return await fetch(input, init)
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        throw error
      }

      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
      attempt += 1
      await wait(delay)
    }
  }
}
