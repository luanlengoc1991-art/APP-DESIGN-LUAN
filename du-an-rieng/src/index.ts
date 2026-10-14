export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return Response.json(
          { ok: false, error: "method_not_allowed" },
          { status: 405, headers: { Allow: "GET, HEAD" } },
        );
      }

      console.log(
        JSON.stringify({
          message: "health",
          method: request.method,
          path: url.pathname,
        }),
      );

      return Response.json({
        ok: true,
        project: "du-an-rieng",
        app: "so-tay-rieng",
        time: new Date().toISOString(),
      });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
