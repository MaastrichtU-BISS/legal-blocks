export default defineEventHandler((event) =>
  forwardMlOperation(event, `/api/datasets/${mlIdParam(event, "id")}`),
);
