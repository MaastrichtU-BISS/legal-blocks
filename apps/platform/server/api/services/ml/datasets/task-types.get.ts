// The task types the service can train for, so a dataset can be given one.
export default defineEventHandler((event) => forwardMlOperation(event, "/api/datasets/task-types"));
