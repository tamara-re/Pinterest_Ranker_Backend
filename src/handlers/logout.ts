import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { buildCookie } from "../lib/auth.js";
import { corsHeaders, json } from "../lib/http.js";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN!;
  const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;

  const clear = buildCookie("app_jwt", "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    domain: COOKIE_DOMAIN || undefined,
    path: "/",
    maxAgeSeconds: 0
  });

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders(FRONTEND_ORIGIN),
      "Set-Cookie": clear,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ok: true })
  };
};
