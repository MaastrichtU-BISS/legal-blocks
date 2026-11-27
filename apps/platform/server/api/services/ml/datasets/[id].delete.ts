// The service deletes the models trained on it as well; the page says so first.
export default defineEventHandler((event) =>
  forwardMlOperation(event, `/api/datasets/${mlIdParam(event, "id")}`),
);
