/** Youth-facing Fitzen uses on-device coaching. No athlete data is sent to an external model.
 * Gemini API terms prohibit clients directed toward or likely accessed by under-18s.
 * Re-enabling hosted advice requires a provider and deployment whose terms support Fitzen's audience.
 */
export async function POST(_req: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: 'Hosted AI is unavailable. Use Fitzen’s on-device coach for guidance.' }), {
    status: 503, headers: { 'content-type': 'application/json' },
  });
}
