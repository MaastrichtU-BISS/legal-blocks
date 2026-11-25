// The token the platform signs for each request it forwards to the ML service.
//
// legal-ml-core in platform mode has no login of its own: whoever the token
// names owns the data. HS256 with node's own crypto, because the format is
// three base64url strings and a library would be a dependency for one HMAC.

import { createHmac } from "node:crypto";

/** legal-ml-core refuses a token valid for longer than this. */
export const ML_TOKEN_LIFETIME_SECONDS = 60;

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function signMlToken(
  ownerId: number,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ sub: String(ownerId), iat: now, exp: now + ML_TOKEN_LIFETIME_SECONDS }),
  );
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${base64url(signature)}`;
}
