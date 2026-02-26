import type { Context } from "hono"

export const getManagedKeyId = (c: Context): string | null =>
  (c.get("managedKeyId" as never) as string | null) ?? null
