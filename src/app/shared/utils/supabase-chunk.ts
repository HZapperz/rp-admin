// Supabase REST URLs are routed through Cloudflare with an 8KB URL limit.
// A `.in('col', ids)` filter with ~200+ UUIDs blows past that and the request
// fails at the network layer (no HTTP status, no error from supabase-js — the
// promise just hangs). Chunk the ID list and merge results to stay safe.

export const IN_CHUNK_SIZE = 100;

export async function chunkedIn<T>(
  buildQuery: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
  ids: string[],
  chunkSize = IN_CHUNK_SIZE
): Promise<{ data: T[]; error: any }> {
  if (ids.length === 0) {
    return { data: [], error: null };
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  const results = await Promise.all(chunks.map(chunk => buildQuery(chunk)));
  const firstError = results.find(r => r.error)?.error;
  if (firstError) {
    return { data: [], error: firstError };
  }

  const merged = results.flatMap(r => r.data || []);
  return { data: merged, error: null };
}
