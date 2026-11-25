// The training curve, polled while a run is going.
export default defineEventHandler((event) =>
  forwardMlOperation(event, `/api/training/${mlIdParam(event, "jobId")}/metrics`),
);
