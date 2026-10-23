// The module catalogue. The composer renders its palette from this.
import { registry } from "../../../../layers/base/server-registry";
import { allowsRole } from "@legal-blocks/manifest";

// The composer has no accounts: the designer is treated as admin, so every
// module is included today. requiredRole is still consulted for consistency so
// a manifest's threshold is honoured everywhere.
export default defineEventHandler(() => {
  const modules = Object.fromEntries(
    Object.entries(registry.modules).filter(([, m]) => allowsRole(m, "admin")),
  );
  return { modules, adapters: registry.adapters };
});
