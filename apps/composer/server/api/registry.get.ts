// The module catalogue. The composer renders its palette from this.
import { registry } from "../../../../layers/base/server-registry";

export default defineEventHandler(() => registry);
