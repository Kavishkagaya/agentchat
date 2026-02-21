const encoder = new TextEncoder();

export type StreamSender = (event: string, payload: unknown) => void;

export function createEventStream() {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const send: StreamSender = (event, payload) => {
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    writer.write(encoder.encode(data));
  };

  const close = async () => {
    try {
      await writer.close();
    } catch {
      // ignore close errors
    }
  };

  return { stream: readable, send, close };
}
