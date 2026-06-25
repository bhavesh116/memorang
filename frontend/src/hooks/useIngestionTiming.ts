import { useEffect, useState } from 'react';
import { formatDurationSeconds } from '@/lib/formatDuration';

interface IngestionTimingInput {
  active: boolean;
  startedAt: string | null | undefined;
}

export function useIngestionTiming({ active, startedAt }: IngestionTimingInput) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [active]);

  const startedMs = startedAt ? new Date(startedAt).getTime() : null;
  const elapsedMs = startedMs != null ? Math.max(0, now - startedMs) : null;

  return {
    startedAtLabel:
      startedMs != null
        ? new Date(startedMs).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : null,
    elapsedLabel:
      elapsedMs != null ? formatDurationSeconds(elapsedMs / 1000) : null,
  };
}
