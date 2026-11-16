// habit_tracker: reads the video names in a public YouTube playlist.
// Deploy in Supabase: Edge Functions -> Deploy a new function -> Via Editor, name it "playlist",
// paste this file, and keep "Verify JWT" on so only signed-in users of your app can call it.
// It reads the public playlist page the way a browser does; if YouTube changes that page, update this file.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

type Video = { id: string; title: string };
type Found = { videos: Video[]; token: string; title: string };

class PlaylistError extends Error {}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// Accepts a playlist link, a watch link with &list=, or just the list ID.
function playlistId(input: unknown): string {
  const text = String(input ?? '').trim();
  if (/^[A-Za-z0-9_-]{10,64}$/.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (host !== 'youtube.com' && host !== 'youtu.be') return '';
    const list = url.searchParams.get('list') ?? '';
    return /^[A-Za-z0-9_-]{10,64}$/.test(list) ? list : '';
  } catch {
    return '';
  }
}

// deno-lint-ignore no-explicit-any
function textOf(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.content) return value.content;
  if (value.simpleText) return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run: { text: string }) => run.text).join('');
  return '';
}

// Collects videos and the "load more" token from YouTube's page data, old or new layout.
// deno-lint-ignore no-explicit-any
function collect(node: any, found: Found) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((child) => collect(child, found)); return; }
  const lockup = node.lockupViewModel;
  if (lockup && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && lockup.contentId) {
    found.videos.push({ id: lockup.contentId, title: textOf(lockup.metadata?.lockupMetadataViewModel?.title) });
  }
  const old = node.playlistVideoRenderer;
  if (old && old.videoId) found.videos.push({ id: old.videoId, title: textOf(old.title) });
  const token = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  if (token) found.token = token;
  if (node.playlistMetadataRenderer?.title) found.title = node.playlistMetadataRenderer.title;
  for (const key of Object.keys(node)) {
    if (key !== 'lockupViewModel' && key !== 'playlistVideoRenderer' && key !== 'continuationItemRenderer') collect(node[key], found);
  }
}

async function get(url: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers: { ...BROWSER, ...(options.headers ?? {}) }, signal: AbortSignal.timeout(20000) });
  } catch {
    throw new PlaylistError('Could not reach YouTube. Try again in a moment.');
  }
  if (!response.ok) throw new PlaylistError(`YouTube answered with an error (${response.status}). Try again later.`);
  return response;
}

async function fetchPlaylist(input: unknown) {
  const id = playlistId(input);
  if (!id) throw new PlaylistError('That is not a YouTube playlist link. It should contain "list=", like youtube.com/playlist?list=…');

  const html = await (await get(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}&hl=en`)).text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s) ?? html.match(/ytInitialData"\]\s*=\s*(\{.*?\});/s);
  if (!match) throw new PlaylistError('YouTube did not send the playlist. It may be private, or YouTube changed its page.');
  let data: unknown;
  try { data = JSON.parse(match[1]); } catch { throw new PlaylistError('The playlist page could not be read. YouTube may have changed its page.'); }

  const found: Found = { videos: [], token: '', title: '' };
  collect(data, found);

  // YouTube sends about 100 videos at a time; ask for more pages while it offers them.
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? '2.20240101.00.00';
  for (let page = 1; found.token && page < 30; page++) {
    const token = found.token;
    found.token = '';
    const url = `https://www.youtube.com/youtubei/v1/browse?prettyPrint=false${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''}`;
    const response = await get(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } }, continuation: token }),
    });
    collect(await response.json(), found);
  }

  const seen = new Set<string>();
  const videos = found.videos.filter((video) => {
    if (seen.has(video.id) || /^\[(private|deleted) video\]$/i.test(video.title)) return false;
    seen.add(video.id);
    return true;
  });
  if (!videos.length) throw new PlaylistError('No videos were found. The playlist may be empty or private, or YouTube changed its page.');
  return { id, title: found.title, videos };
}

// "Verify JWT" only proves the caller has the project's public key, which is in the app's public code.
// This asks Supabase who is signed in, so only a logged-in user of your app can use the function.
async function signedIn(request: Request): Promise<boolean> {
  const auth = request.headers.get('Authorization') ?? '';
  const apikey = request.headers.get('apikey') ?? '';
  const base = Deno.env.get('SUPABASE_URL');
  if (!base || !auth.startsWith('Bearer ') || !apikey) return false;
  try {
    const response = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return false;
    const user = await response.json();
    return Boolean(user && user.id);
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!(await signedIn(request))) return reply(401, { error: 'Sign in to habit_tracker to fetch playlists.' });
  try {
    const body = await request.json().catch(() => ({}));
    return reply(200, await fetchPlaylist(body?.url));
  } catch (error) {
    if (error instanceof PlaylistError) return reply(400, { error: error.message });
    console.error(error);
    return reply(500, { error: 'The playlist could not be read.' });
  }
});
