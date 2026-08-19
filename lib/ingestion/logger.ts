type LogLevel = "info" | "warn" | "error";

export type IngestionLog = {
  level: LogLevel;
  provider: string;
  operation: string;
  identifier?: string;
  durationMs?: number;
  result?: string;
  records?: number;
  error?: string;
};

export function logIngestion(entry: IngestionLog) {
  const safe = { timestamp: new Date().toISOString(), ...entry };
  const line = JSON.stringify(safe);
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.info(line);
}
