export class OperationTimeoutError extends Error {
  constructor() {
    super("انتهت مهلة العملية — تحقق من اتصالك بالإنترنت وحاول مجدداً.");
    this.name = "OperationTimeoutError";
  }
}

// Race a mutation against a hard timeout so a hung request can never keep a
// button/permanently-disabled UI state forever. The underlying request keeps
// running; the UI is simply released (success/error callbacks still fire when
// it settles).
export function withTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new OperationTimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function operationError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع — حاول مجدداً.";
}