import { datasetRows, datasets } from "@legal-blocks/db";
import { documentsToCsv } from "../../../ml/table";

/**
 * This person's Documents datasets as training tables: how many rows each
 * has and which columns, so the workbench offers only the task types a
 * dataset can be trained for. Platform data, not a call to the service.
 */
export default defineEventHandler((event) => {
  const me = currentUser(event);
  const db = requireDb(event);
  return datasets(db)
    .filter((d) => d.user_id === me.id)
    .map((d) => {
      const rows = datasetRows(db, d.id);
      return { id: d.id, name: d.name, rows: rows.length, columns: documentsToCsv(rows).columns };
    });
});
