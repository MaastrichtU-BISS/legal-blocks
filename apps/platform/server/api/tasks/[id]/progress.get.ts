// How far along a task is, per annotator and per document.
//
// Not gated here, and deliberately so rather than by oversight: this platform
// has no login, so the server cannot tell who is asking. Whoever set the task
// up is a choice made in the browser's "Working as" selector, which anyone can
// change. The workspace hides this from annotators because showing somebody
// else's progress to a colleague is a distraction; it is not access control,
// and calling it that in a comment would be worse than the gap itself.
//
// The seam is real though: when there is a login, this is the handler that
// grows a role check, and nothing above it has to move.

import { taskProgress } from "@legal-blocks/db";

export default defineEventHandler((event) => taskProgress(requireDb(event), idParam(event, "id")));
