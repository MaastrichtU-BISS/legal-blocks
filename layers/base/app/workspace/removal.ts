// Removing a row from a workspace tab.
//
// vue-legal-workspace has no notion of removing. A tab that allows it gains
// one more column, filled through that column's cell slot with the shared
// RemoveButton, so neither the package nor the button knows what the rows are.
// What a removal does is this file's callers' business: one function to call,
// and one phrase saying what else goes.

import type { Column, Row, WorkspaceTab } from "vue-legal-workspace";

export const REMOVE_COLUMN = "remove";

export interface Removal<T = Row> {
  name(row: T): string;
  /** What goes with it, such as "its 960 documents". */
  consequence?(row: T): string | undefined;
  /** Whether this person may remove it at all. No button when not. */
  allowed?(row: T): boolean;
  /** Why this row cannot be removed now, when that is known without asking. */
  blocked?(row: T): string | undefined;
  remove(row: T): Promise<void>;
}

export interface RemovableTab extends WorkspaceTab {
  removal?: Removal;
}

const removeColumn: Column = { key: REMOVE_COLUMN, label: "", align: "end" };

export function withRemoval<T>(tab: WorkspaceTab, removal: Removal<T>): RemovableTab {
  return { ...tab, columns: [...tab.columns, removeColumn], removal: removal as unknown as Removal };
}
