import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../lib/ddb";
import { buildCookie, signAppJwt } from "../../lib/auth";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const {
    PINTEREST_CLIENT_ID,
    PINTEREST_CLIENT_SECRET,
    PINTEREST_REDIRECT_URI,
    OAUTH_STATES_TABLE,
    USERS_TABLE,
    APP_ORIGIN,
    COOKIE_DOMAIN
  } = process.env;

  if (
    !PINTEREST_CLIENT_ID ||
    !PINTEREST_CLIENT_SECRET ||
    !PINTEREST_REDIRECT_URI ||
    !OAUTH_STATES_TABLE ||
    !USERS_TABLE ||
    !APP_ORIGIN
  ) {
    return { statusCode: 500, body: "Missing env vars" };
  }

  const qs = event.queryStringParameters ?? {};
  const code = qs.code;
  const state = qs.state;

  if (!code || !state) return { statusCode: 400, body: "Missing code/state" };

  // 1) Validate state
  const stateRes = await ddb.send(new GetCommand({
    TableName: OAUTH_STATES_TABLE,
    Key: { state }
  }));
  if (!stateRes.Item) return { statusCode: 400, body: "Invalid/expired state" };

  // One-time use
  await ddb.send(new DeleteCommand({
    TableName: OAUTH_STATES_TABLE,
    Key: { state }
  }));

  const returnTo = typeof stateRes.Item.returnTo === "string" ? stateRes.Item.returnTo : "/";

  // 2) Exchange code -> Pinterest access token
  const tokenResp = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: PINTEREST_CLIENT_ID,
      client_secret: PINTEREST_CLIENT_SECRET,
      redirect_uri: PINTEREST_REDIRECT_URI
    }).toString()
  });

  if (!tokenResp.ok) {
    return { statusCode: 502, body: `Token exchange failed: ${await tokenResp.text()}` };
  }

  const tokenJson: any = await tokenResp.json();
  const accessToken = tokenJson.access_token as string | undefined;
  const expiresIn = tokenJson.expires_in as number | undefined;

  if (!accessToken) return { statusCode: 502, body: "No access_token from Pinterest" };

  // 3) Fetch Pinterest user identity
  const meResp = await fetch("https://api.pinterest.com/v5/user_account", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!meResp.ok) {
    return { statusCode: 502, body: `User fetch failed: ${await meResp.text()}` };
  }

  const meJson: any = await meResp.json();
  const pinterestUserId = meJson?.id ?? meJson?.user_account?.id;
  if (!pinterestUserId) return { statusCode: 502, body: "Could not determine Pinterest user id" };

  // 4) Upsert user
  const pk = `USER#pinterest:${String(pinterestUserId)}`;
  const nowIso = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      pk,
      provider: "pinterest",
      providerUserId: String(pinterestUserId),
      createdAt: nowIso,
      updatedAt: nowIso,
      // Store only if you need Pinterest API calls later; ideally encrypt.
      pinterestAccessToken: accessToken,
      pinterestTokenExpiresAt: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined
    }
  }));

  // 5) Issue YOUR app JWT in HttpOnly cookie
  const jwt = await signAppJwt({ sub: pk, provider: "pinterest" });

  const cookie = buildCookie("app_jwt", jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    domain: COOKIE_DOMAIN || undefined, // e.g. .yoursite.com
    path: "/",
    maxAgeSeconds: 60 * 60 * 24 * 7
  });

  return {
    statusCode: 302,
    headers: {
      "Set-Cookie": cookie,
      Location: `${APP_ORIGIN}${returnTo}`
    },
    body: ""
  };
};
