import { taskAnnotators } from "@legal-blocks/db";

export default defineEventHandler((event) =>
  taskAnnotators(requireDb(event), idParam(event, "id")),
);
