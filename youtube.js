'use strict';
// Reads the video names in a public YouTube playlist from its web page, the way a browser would.
// YouTube changes its page from time to time; if fetching stops working, this is the file to update.
// It reads only public playlist pages, once each time you save or reload a course.

const PAGE_LIMIT = 30; // About 100 videos per page, so up to roughly 3,000 videos.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

class PlaylistError extends Error {}

// Accepts a full playlist link, a watch link with &list=, or just the list ID.
function playlistId(input) {
  const text = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{10,64}$/.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (host !== 'youtube.com' && host !== 'youtu.be') return '';
    const list = url.searchParams.get('list') || '';
    return /^[A-Za-z0-9_-]{10,64}$/.test(list) ? list : '';
  } catch {
    return '';
  }
}

function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.content) return value.content;
  if (value.simpleText) return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text).join('');
  return '';
}

// Collects videos and the "load more" token from any part of YouTube's data, old or new layout.
function collect(node, found) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((child) => collect(child, found)); return; }
  const lockup = node.lockupViewModel;
  if (lockup && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && lockup.contentId) {
    const title = textOf(lockup.metadata && lockup.metadata.lockupMetadataViewModel && lockup.metadata.lockupMetadataViewModel.title);
    found.videos.push({ id: lockup.contentId, title });
  }
  const old = node.playlistVideoRenderer;
  if (old && old.videoId) found.videos.push({ id: old.videoId, title: textOf(old.title) });
  const more = node.continuationItemRenderer;
  if (more) {
    const token = more.continuationEndpoint && more.continuationEndpoint.continuationCommand && more.continuationEndpoint.continuationCommand.token;
    if (token) found.token = token;
  }
  if (node.playlistMetadataRenderer && node.playlistMetadataRenderer.title) found.title = node.playlistMetadataRenderer.title;
  for (const key of Object.keys(node)) {
    if (key !== 'lockupViewModel' && key !== 'playlistVideoRenderer' && key !== 'continuationItemRenderer') collect(node[key], found);
  }
}

async function get(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, headers: { ...HEADERS, ...(options.headers || {}) }, signal: AbortSignal.timeout(20000) });
  } catch {
    throw new PlaylistError('Could not reach YouTube. Check your internet connection and try again.');
  }
  if (!response.ok) throw new PlaylistError(`YouTube answered with an error (${response.status}). Try again later.`);
  return response;
}

async function fetchPlaylist(input) {
  const id = playlistId(input);
  if (!id) throw new PlaylistError('That is not a YouTube playlist link. It should contain "list=", like youtube.com/playlist?list=…');

  const html = await (await get(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}&hl=en`)).text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s) || html.match(/ytInitialData"\]\s*=\s*(\{.*?\});/s);
  if (!match) throw new PlaylistError('YouTube did not send the playlist. It may be private, or YouTube changed its page.');
  let data;
  try { data = JSON.parse(match[1]); } catch { throw new PlaylistError('The playlist page could not be read. YouTube may have changed its page.'); }

  const found = { videos: [], token: '', title: '' };
  collect(data, found);

  // YouTube sends about 100 videos at a time. Ask for the rest page by page.
  const apiKey = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const clientVersion = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || '2.20240101.00.00';
  for (let page = 1; found.token && page < PAGE_LIMIT; page++) {
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

  // One entry per video, in playlist order, without private or deleted ones.
  const seen = new Set();
  const videos = found.videos.filter((video) => {
    if (seen.has(video.id) || /^\[(private|deleted) video\]$/i.test(video.title)) return false;
    seen.add(video.id);
    return true;
  });
  if (!videos.length) throw new PlaylistError('No videos were found. The playlist may be empty or private, or YouTube changed its page.');
  return { id, title: found.title, videos };
}

module.exports = { fetchPlaylist, playlistId, PlaylistError };
