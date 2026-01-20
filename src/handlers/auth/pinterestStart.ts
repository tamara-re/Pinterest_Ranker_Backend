import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../lib/ddb.js";
import { randomState } from "../../lib/auth.js";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const {
    PINTEREST_CLIENT_ID,
    PINTEREST_REDIRECT_URI,
    OAUTH_STATES_TABLE
  } = process.env;

  if (!PINTEREST_CLIENT_ID || !PINTEREST_REDIRECT_URI || !OAUTH_STATES_TABLE) {
    return { statusCode: 500, body: "Missing env vars" };
  }

  const qs = event.queryStringParameters ?? {};
  const returnTo = (qs.returnTo && qs.returnTo.startsWith("/")) ? qs.returnTo : "/";

  const state = randomState(32);
  const ttl = Math.floor(Date.now() / 1000) + 600; // 10 min

  await ddb.send(new PutCommand({
    TableName: OAUTH_STATES_TABLE,
    Item: { state, ttl, returnTo }
  }));

  // minimal scope to read basic account info
  const scope = encodeURIComponent("user_accounts:read");

  // NOTE: confirm your Pinterest authorize endpoint in their docs for your app.
  const authorizeUrl =
    `https://www.pinterest.com/oauth/` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(PINTEREST_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(PINTEREST_REDIRECT_URI)}` +
    `&scope=${scope}` +
    `&state=${encodeURIComponent(state)}`;

  return {
    statusCode: 302,
    headers: { Location: authorizeUrl },
    body: ""
  };
};
