// The catalogue of model types, which creating a model chooses from.
export default defineEventHandler((event) => forwardMlOperation(event, "/api/models/available"));
