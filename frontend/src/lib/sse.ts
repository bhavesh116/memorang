export interface SSEHandlers {
  onAck?: (payload: Record<string, unknown>) => void;
  onToken?: (text: string) => void;
  onMessage?: (payload: Record<string, unknown>) => void;
  onPlan?: (payload: Record<string, unknown>) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  handlers: SSEHandlers,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';

  const flushEvent = (raw: string) => {
    const lines = raw.split('\n');
    let eventName = currentEvent;
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      }
      if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }

    if (!data) {
      return;
    }

    const parsed = JSON.parse(data);
    currentEvent = eventName;

    if (eventName === 'ack') handlers.onAck?.(parsed);
    if (eventName === 'token') handlers.onToken?.((parsed as { text: string }).text);
    if (eventName === 'message') handlers.onMessage?.(parsed);
    if (eventName === 'plan') handlers.onPlan?.(parsed);
    if (eventName === 'done') handlers.onDone?.();
    if (eventName === 'error') {
      handlers.onError?.((parsed as { message?: string }).message || 'Streaming failed');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf('\n\n');

    while (separatorIndex !== -1) {
      const chunk = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      flushEvent(chunk);
      separatorIndex = buffer.indexOf('\n\n');
    }
  }
}
