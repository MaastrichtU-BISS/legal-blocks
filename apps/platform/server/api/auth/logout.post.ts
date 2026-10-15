export default defineEventHandler(async (event) => {
  await clearUserSession(event, sessionCookie(event));
  setResponseStatus(event, 204);
  return null;
});
