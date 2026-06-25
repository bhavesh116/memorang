import { useEffect } from 'react';

export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    void callback();

    const interval = window.setInterval(() => {
      void callback();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [callback, intervalMs, enabled]);
}
