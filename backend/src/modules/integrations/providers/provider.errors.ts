export class ProviderAdapterError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor(input: { code: string; message: string; retryable?: boolean; statusCode?: number; cause?: unknown }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = 'ProviderAdapterError';
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.statusCode = input.statusCode ?? 502;
  }
}

export function asProviderAdapterError(error: unknown): ProviderAdapterError {
  if (error instanceof ProviderAdapterError) return error;
  return new ProviderAdapterError({
    code: 'PROVIDER_REQUEST_FAILED',
    message: 'Не удалось выполнить запрос к внешнему провайдеру',
    retryable: true,
    statusCode: 502,
    cause: error,
  });
}
