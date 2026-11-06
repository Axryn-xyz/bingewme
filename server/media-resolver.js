import { load } from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}
function pageURL(value, base) {
  const url = new URL(value, base);
  if (url.href.length > 4096) throw new Error('This video link is too long to share.');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use a public HTTP or HTTPS video link.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && !isPublicAddress(host)))
    throw new Error('Private network pages cannot be extracted.');
  if (url.port && !['80', '443'].includes(url.port))
    throw new Error('Page extraction requires a standard HTTP or HTTPS port.');
  return url;
}
export function knownMedia(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (['youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
    const id =
      host === 'youtu.be'
        ? parts[0]
        : parts[0] === 'watch'
          ? url.searchParams.get('v')
          : ['embed', 'shorts', 'live'].includes(parts[0])
            ? parts[1]
            : null;
    if (id && /^[\w-]{11}$/.test(id))
      return {
        url: `https://www.youtube.com/watch?v=${id}`,
        provider: 'youtube',
        mediaType: 'embed',
      };
    throw new Error('Paste a YouTube video link, rather than a channel or playlist page.');
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((part) => /^\d+$/.test(part));
    if (id) return { url: `https://vimeo.com/${id}`, provider: 'vimeo', mediaType: 'embed' };
  }
  if (host === 'clips.twitch.tv') {
    const clip = url.searchParams.get('clip') || parts[0];
    if (clip && /^[\w-]+$/.test(clip))
      return { url: `https://clips.twitch.tv/${clip}`, provider: 'twitch', mediaType: 'embed' };
  }
  if (host === 'twitch.tv' || host === 'player.twitch.tv') {
    const video =
      host === 'player.twitch.tv'
        ? url.searchParams.get('video')
        : parts[0] === 'videos'
          ? parts[1]
          : null;
    if (video && /^v?\d+$/.test(video))
      return {
        url: `https://www.twitch.tv/videos/${video.replace(/^v/, '')}`,
        provider: 'twitch',
        mediaType: 'embed',
      };
    if (parts[1] === 'clip' && parts[2])
      return { url: `https://clips.twitch.tv/${parts[2]}`, provider: 'twitch', mediaType: 'embed' };
    const channel =
      host === 'player.twitch.tv'
        ? url.searchParams.get('channel')
        : parts.length === 1
          ? parts[0]
          : null;
    if (
      channel &&
      /^[\w]{1,25}$/.test(channel) &&
      ![
        'directory',
        'downloads',
        'search',
        'settings',
        'subscriptions',
        'login',
        'signup',
      ].includes(channel)
    )
      return { url: `https://www.twitch.tv/${channel}`, provider: 'twitch', mediaType: 'embed' };
    throw new Error('Paste a Twitch channel, video, or clip link.');
  }
  if (/\.m3u8$/i.test(url.pathname)) return { url: url.href, provider: 'direct', mediaType: 'hls' };
  if (/\.(mp4|webm|mov|m4v|mp3|m4a|ogg|wav|aac)$/i.test(url.pathname))
    return {
      url: url.href,
      provider: 'direct',
      mediaType: /\.(mp3|m4a|ogg|wav|aac)$/i.test(url.pathname) ? 'audio' : 'video',
    };
  return null;
}

export function extractMedia(html, base) {
  const $ = load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').text())
    .trim()
    .slice(0, 200);
  const candidates = [];
  const add = (value, type = 'page', mime = '') => {
    if (!value || candidates.length >= 30) return;
    try {
      const url = new URL(value.replace(/\\\//g, '/'), base);
      if (['http:', 'https:'].includes(url.protocol))
        candidates.push({ url: url.href, type, mime });
    } catch {
      /* Ignore unusable player attributes. */
    }
  };
  $('video,audio,video source,audio source').each((_, element) =>
    add(
      $(element).attr('src') || $(element).attr('data-src'),
      'direct',
      $(element).attr('type') || '',
    ),
  );
  const walk = (value, depth = 0) => {
    if (!value || depth > 6) return;
    if (Array.isArray(value)) return value.slice(0, 30).forEach((item) => walk(item, depth + 1));
    if (typeof value !== 'object') return;
    add(value.contentUrl, 'direct');
    add(value.embedUrl);
    for (const key of ['@graph', 'video', 'mainEntity', 'itemListElement'])
      walk(value[key], depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      walk(JSON.parse($(element).html() || ''));
    } catch {
      /* Invalid structured data is common. */
    }
  });
  for (const selector of [
    'meta[property="og:video:secure_url"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video"]',
    'meta[name="twitter:player:stream"]',
    'meta[name="twitter:player"]',
  ])
    add($(selector).attr('content'));
  $('iframe').each((_, element) => add($(element).attr('src') || $(element).attr('data-src')));
  $('script').each((_, element) => {
    const text = ($(element).html() || '').replace(/\\\//g, '/');
    for (const match of text.matchAll(
      /["']((?:https?:\/\/|\/)[^"'<>\s]+\.(?:m3u8|mp4|webm)(?:\?[^"'<>\s]*)?)["']/gi,
    ))
      add(match[1], 'direct');
  });
  return { title, candidates };
}

function requestPage(url, timeout) {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(
      url,
      {
        agent: false,
        signal: AbortSignal.timeout(timeout),
        headers: {
          'User-Agent': 'BingeWMe/1.0',
          Accept: 'text/html,application/xhtml+xml,video/*,audio/*;q=0.8',
        },
        lookup(host, options, callback) {
          lookup(host, { all: true, verbatim: true })
            .then((addresses) => {
              if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
                throw new Error('Private network pages cannot be extracted.');
              if (options?.all) callback(null, addresses);
              else callback(null, addresses[0].address, addresses[0].family);
            })
            .catch((error) => callback(error));
        },
      },
      (response) => {
        const type = String(response.headers['content-type'] || '');
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.destroy();
          resolve({ redirect: response.headers.location });
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.destroy();
          reject(
            new Error(
              `The page refused extraction (HTTP ${response.statusCode}). Try its direct video or embed link.`,
            ),
          );
          return;
        }
        if (/^(video|audio)\/|mpegurl/i.test(type)) {
          response.destroy();
          resolve({
            mediaType: /mpegurl/i.test(type)
              ? 'hls'
              : type.startsWith('audio/')
                ? 'audio'
                : 'video',
          });
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            response.destroy(new Error('This page is too large to inspect.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', reject);
      },
    );
    request.on('error', reject);
  });
}
async function resolveCandidate(
  value,
  visited = new Set(),
  depth = 0,
  deadline = Date.now() + 15000,
) {
  if (Date.now() >= deadline)
    throw new Error('This page took too long to inspect. Try its direct video link.');
  const url = pageURL(value);
  const known = knownMedia(url.href);
  if (known) return known;
  if (depth > 2 || visited.has(url.href) || visited.size >= 6)
    throw new Error('No supported public video was found in this page.');
  visited.add(url.href);
  const page = await requestPage(url, Math.max(1, Math.min(8000, deadline - Date.now())));
  if (page.redirect)
    return resolveCandidate(pageURL(page.redirect, url).href, visited, depth + 1, deadline);
  if (page.mediaType) return { url: url.href, provider: 'direct', mediaType: page.mediaType };
  const { title, candidates } = extractMedia(page.html, url.href);
  for (const candidate of candidates) {
    try {
      const target = pageURL(candidate.url);
      const media = knownMedia(target.href);
      if (media) return { ...media, title };
      if (candidate.type === 'direct')
        return {
          url: target.href,
          provider: 'direct',
          mediaType: /mpegurl/i.test(candidate.mime) ? 'hls' : 'video',
          title,
        };
      const nested = await resolveCandidate(target.href, visited, depth + 1, deadline);
      return { ...nested, title: title || nested.title };
    } catch {
      /* Try the next actual player rather than unrelated page links. */
    }
  }
  throw new Error(
    'No shareable video was found. This site may load its player with JavaScript, require login, or prevent embedding. Try a direct video link or screen share.',
  );
}

let activeInspections = 0;
export async function resolveMedia(value) {
  const url = pageURL(value);
  const known = knownMedia(url.href);
  if (known) return known;
  if (activeInspections >= 4) throw new Error('Media lookup is busy. Try again in a moment.');
  activeInspections++;
  try {
    return await resolveCandidate(url.href);
  } finally {
    activeInspections--;
  }
}
