export async function POST() {
  return Response.json({ error: "LEGACY_ENDPOINT_RETIRED", message: "Use el motor único de Rocky." }, { status: 410 });
}
export const GET = POST;
