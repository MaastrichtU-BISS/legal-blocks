// What an export needs to know, and how a platform's name becomes a filename.

/** Where an exported platform is published on the host. */
export const DEFAULT_PORT = 7777;

export interface ExportOptions {
  pipeline: Pipeline;
  registry: Registry;
  /** The platform image, with its tag. */
  platformImage: string;
  /**
   * The agreement service's image, with its tag. Only named in the compose
   * file when the pipeline actually uses it.
   */
  iaaImage: string;
  /** Port the platform is published on. 0 or absent means the default. */
  port?: number;
  /**
   * Overrides the identifier that keeps this export's storage separate from
   * every other one. Only for tests — leave it unset and a fresh one is made.
   */
  id?: string;
}

/**
 * Reduces a pipeline name to something usable as a filename and as a compose
 * project name, which may only hold lowercase letters, digits, dashes and
 * underscores.
 *
 * Anything else is dropped rather than replaced, so a path separator cannot
 * survive into a filename in any form.
 */
export function slug(name: string): string {
  let out = "";
  for (const ch of name.trim().toLowerCase()) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (ch === " " || ch === "-" || ch === "_") out += "-";
  }
  out = out.replace(/^-+|-+$/g, "");
  return out === "" ? "platform" : out;
}
