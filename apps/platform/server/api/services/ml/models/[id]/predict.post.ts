export default defineEventHandler((event) =>
  forwardMlOperation(event, `/api/models/${mlIdParam(event, "id")}/predict`),
);
