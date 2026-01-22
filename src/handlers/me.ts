import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../lib/ddb";
import { parseCookies, verifyAppJwt } from "../lib/auth";
import { corsHeaders, json } from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const USERS_TABLE = process.env.USERS_TABLE!;
  const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN!; // e.g. https://app.yoursite.com

  if (!USERS_TABLE || !FRONTEND_ORIGIN) {
    return { statusCode: 500, body: "Missing env vars" };
  }

  if (event.requestContext.http.method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(FRONTEND_ORIGIN), body: "" };
  }

  const cookieHeader = event.headers.cookie || event.headers.Cookie;
  const cookies = parseCookies(cookieHeader);
  const token = cookies.app_jwt;

  if (!token) {
    return json(200, { authenticated: false }, corsHeaders(FRONTEND_ORIGIN));
  }

  try {
    const payload = await verifyAppJwt(token);
    const sub = payload.sub as string | undefined;
    if (!sub) return json(200, { authenticated: false }, corsHeaders(FRONTEND_ORIGIN));

    const userRes = await ddb.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { pk: sub }
    }));

    if (!userRes.Item) {
      return json(200, { authenticated: false }, corsHeaders(FRONTEND_ORIGIN));
    }

    return json(
      200,
      {
        authenticated: true,
        user: {
          id: userRes.Item.pk,
          provider: userRes.Item.provider,
          providerUserId: userRes.Item.providerUserId
        }
      },
      corsHeaders(FRONTEND_ORIGIN)
    );
  } catch {
    return json(200, { authenticated: false }, corsHeaders(FRONTEND_ORIGIN));
  }
};
