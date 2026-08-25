// The three axes a module is described on. They are separate on purpose and
// are the thing most often confused, so they live in one file together.

/**
 * What sort of thing is being built. There are two, and nearly every
 * difference between one export and another follows from which it is.
 *
 * This is a property of the export, never of a module: legal-annotation-kit
 * ships both `createBulkSource` ("for hosts with no backend to save to") and
 * `createLazySource` ("for hosts with an external backend"), which is the
 * packages themselves saying the same component works either way and the host
 * decides. A module declares only which kinds it can be part of.
 */
export type Kind = "pipeline" | "workspace";

/** Both, in the order the composer offers them. */
export const KINDS: readonly Kind[] = ["pipeline", "workspace"];

/**
 * What a module *is*, as opposed to what an export is. A "source" is a UI
 * module with no inputs — where documents come from.
 */
export type ModuleKind = "source" | "ui" | "service";

/**
 * How a module is executed, and the seam that keeps packaging swappable.
 *
 * "web" modules are Vue components in the frontend bundle. "node" modules are
 * server code the platform imports directly. "container" modules are separate
 * images the platform reverse-proxies to — declared so that adding a service
 * in another language is a manifest change plus a proxy, not a redesign.
 */
export type Runtime = "web" | "node" | "container";

/**
 * Whether something restricted to `kinds` applies in `kind`.
 *
 * An empty list means "both", so a manifest only has to say something when a
 * module or field is genuinely restricted.
 */
export function worksIn(kinds: readonly Kind[] | undefined, kind: Kind): boolean {
  return !kinds || kinds.length === 0 || kinds.includes(kind);
}
