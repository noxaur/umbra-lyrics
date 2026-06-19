export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/api/test/echo") {
      return Response.json({
        authorization: request.headers.get("Authorization"),
        gateway: request.headers.get("X-Umbra-Gateway"),
        requestId: request.headers.get("X-Umbra-Request-Id"),
      })
    }

    if (url.pathname === "/api/test/range") {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": "3",
          "Content-Range": "bytes 10-12/100",
          "Content-Type": "audio/webm",
          "X-Received-Range": request.headers.get("Range") ?? "",
        },
      })
    }

    if (url.pathname === "/api/test/stream") {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first"))
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode("second"))
            controller.close()
          }, 150)
        },
      })
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      })
    }

    if (url.pathname === "/api/test/failure") {
      return Response.json({ error: "legacy_fixture_error" }, { status: 503 })
    }

    if (url.pathname === "/api/test/throw") {
      return Response.json({ error: "legacy_fixture_exception" }, { status: 500 })
    }

    return new Response("fixture not found", { status: 404 })
  },
}
