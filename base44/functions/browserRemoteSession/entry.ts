// Feature suspended, including direct backend calls from older clients.
export default async function(): Promise<Response> {
  return Response.json({
    error: 'Corporate internet browser is disabled by company administration.',
    code: 'CORPORATE_BROWSER_DISABLED',
    disabled: true
  }, {status: 503, headers: {'Cache-Control': 'no-store'}});
}
