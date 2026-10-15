import type { Account } from "@legal-blocks/db";

// What the session cookie holds: the user's id and nothing else. Their role is
// read from the database on every request, so a change takes effect at once.
declare module "#auth-utils" {
  interface User {
    id: number;
  }
}

declare module "h3" {
  interface H3EventContext {
    user?: Account;
  }
}

export {};
