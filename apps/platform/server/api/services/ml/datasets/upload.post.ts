// Streamed straight through: a dataset can be up to the service's 100 MB limit.
export default defineEventHandler((event) => forwardMlOperation(event, "/api/datasets/upload"));
