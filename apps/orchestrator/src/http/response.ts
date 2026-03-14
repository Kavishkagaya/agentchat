export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    status,
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
