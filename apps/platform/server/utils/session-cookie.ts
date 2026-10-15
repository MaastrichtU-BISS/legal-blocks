// How the session cookie is written.
//
// nuxt-auth-utils marks it Secure by default, and a browser drops a Secure
// cookie that arrives over plain http — except on "localhost" in some browsers
// and not in Safari. Sign-in then answers 200 and the next request is signed
// out. So it is Secure exactly when the request came over https, directly or
// through a proxy that says so in X-Forwarded-Proto.

import type { H3Event } from "h3";

export function sessionCookie(event: H3Event) {
  return { cookie: { secure: getRequestProtocol(event) === "https" } };
}
