import { NextResponse } from "next/server";

/**
 * Figma plugin iframes often send Origin: null (or omit Origin).
 * Allow * so fetch from the plugin UI succeeds. Endpoints still require
 * a session bearer token where needed.
 */
export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function withCors(response: NextResponse): NextResponse {
  const headers = corsHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export function jsonWithCors(
  body: unknown,
  init?: { status?: number }
): NextResponse {
  return withCors(
    NextResponse.json(body, { status: init?.status ?? 200 })
  );
}

export function optionsResponse(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}
