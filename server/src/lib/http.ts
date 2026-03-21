export type ApiErrorBody = { error: true; message: string; field?: string };

export function apiError(message: string, field?: string): ApiErrorBody {
  return field ? { error: true, message, field } : { error: true, message };
}

