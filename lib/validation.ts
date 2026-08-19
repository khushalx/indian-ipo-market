import { z } from "zod";

export const watchlistStorageSchema = z.array(z.string().min(1)).max(100);

export function parseWatchlist(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = watchlistStorageSchema.safeParse(JSON.parse(value));
    return parsed.success ? [...new Set(parsed.data)] : [];
  } catch {
    return [];
  }
}
