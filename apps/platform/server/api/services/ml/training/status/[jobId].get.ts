export default defineEventHandler((event) =>
  forwardMlOperation(event, `/api/training/status/${mlIdParam(event, "jobId")}`),
);
