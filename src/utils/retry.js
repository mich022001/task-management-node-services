export function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function retry(
  operation,
  { retries = 2, delay = 300, shouldRetry = () => true, onRetry } = {},
) {
  let attempt = 0;

  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      const canRetry = attempt < retries && shouldRetry(error);

      if (!canRetry) {
        throw error;
      }

      attempt += 1;

      onRetry?.({
        attempt,
        retries,
        error,
      });

      if (delay > 0) {
        await sleep(delay);
      }
    }
  }
}
