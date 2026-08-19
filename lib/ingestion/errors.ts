export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly operation: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
