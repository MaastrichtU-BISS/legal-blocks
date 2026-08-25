// The module catalogue. The runtime uses it to find each node's component and
// config schema, so it has no hardcoded knowledge of any specific module.
import { registry } from "../../../../layers/base/server-registry";

export default defineEventHandler(() => registry);
