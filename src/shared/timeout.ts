export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): { promise: Promise<T>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // AbortSignal dispatch is unreliable in the TUI runtime, so the timer must settle the request.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
      onTimeout?.();
    }, ms);
  });
  return {
    promise: Promise.race([promise, timeout]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    }),
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      onTimeout?.();
    },
  };
}
