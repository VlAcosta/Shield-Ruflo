export type AppErrorOptions = {
  code: string;
  message: string;
  statusCode?: number;
  details?: unknown;
};

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
  }
}
