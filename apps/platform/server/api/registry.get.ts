// The module catalogue. The runtime uses it to find each node's component and
// config schema, so it has no hardcoded knowledge of any specific module.
import { registry } from "../../../../layers/base/server-registry";
import { allowsRole } from "@legal-blocks/manifest";

// The platform has one owner account, which is an admin (see owner() in
// server/utils/platform.ts). Modules declaring requiredRole are filtered here
// so the catalogue only advertises what that account may use; higher
// thresholds hide modules. Seam: resolve a signed-in role here instead of the
// hardcoded "admin" once the platform gains real accounts.
export default defineEventHandler(() => {
  const modules = Object.fromEntries(
    Object.entries(registry.modules).filter(([, m]) => allowsRole(m, "admin")),
  );
  return { modules, adapters: registry.adapters };
});
