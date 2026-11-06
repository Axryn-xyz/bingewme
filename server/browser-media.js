import { access } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { pageURL, isPublicAddress } from './media-resolver.js';

// Browser requests never connect directly: every response passes through this DNS-pinned fetch.
export function publicResource(value, { timeout = 5000, maxBytes = 3 * 1024 ** 2 } = {}) {
  const url = pageURL(value);
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(
      url,
      {
        agent: false,
        signal: AbortSignal.timeout(timeout),
        headers: { 'User-Agent': 'BingeWMe/1.0', 'Accept-Encoding': 'identity' },
        lookup(host, options, callback) {
          lookup(host, { all: true, verbatim: true })
            .then((addresses) => {
              if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
                throw new Error('Private network resources cannot be inspected.');
              if (options?.all) callback(null, addresses);
              else callback(null, addresses[0].address, addresses[0].family);
            })
            .catch(callback);
        },
      },
      (response) => {
        const status = response.statusCode || 502;
        const headers = {};
        for (const name of [
          'content-type',
          'location',
          'access-control-allow-origin',
          'content-security-policy',
        ]) {
          if (typeof response.headers[name] === 'string') headers[name] = response.headers[name];
        }
        const type = headers['content-type'] || '';
        // Inspect media headers, never download whole movies or their individual segments.
        if (
          (/^(video|audio)\//i.test(type) && !/mpegurl/i.test(type)) ||
          (status >= 300 && status < 400)
        ) {
          response.destroy();
          resolve({ status, headers, body: Buffer.alloc(0) });
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBytes)
            response.destroy(new Error('Resource exceeds the inspection limit.'));
          else chunks.push(chunk);
        });
        response.on('end', () => resolve({ status, headers, body: Buffer.concat(chunks) }));
        response.on('error', reject);
      },
    );
    request.on('error', reject);
  });
}

export function detectedMedia(value, type = '') {
  let url;
  try {
    url = pageURL(value);
  } catch {
    return null;
  }
  if (/\.(ts|m4s|aac|key)$/i.test(url.pathname)) return null;
  if (/\.m3u8$/i.test(url.pathname) || /mpegurl/i.test(type))
    return { url: url.href, provider: 'direct', mediaType: 'hls' };
  if (
    /\.(mp4|webm|mov|m4v|mp3|m4a|ogg|wav)$/i.test(url.pathname) ||
    /^(video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|ogg|wav))\b/i.test(type)
  )
    return {
      url: url.href,
      provider: 'direct',
      mediaType: /^(audio\/)|\.(mp3|m4a|ogg|wav)$/i.test(type || url.pathname) ? 'audio' : 'video',
    };
  return null;
}

// Resolve an unencrypted rendition, not a browser-local blob or encrypted segment stream.
export async function validateMedia(
  candidate,
  fetchResource = publicResource,
  depth = 0,
  budget = { remaining: 16 },
) {
  if (depth > 4 || --budget.remaining < 0) throw new Error('Too many nested media playlists.');
  const response = await fetchResource(candidate.url);
  if (response.status >= 300 && response.status < 400 && response.headers.location)
    return validateMedia(
      { ...candidate, url: pageURL(response.headers.location, candidate.url).href },
      fetchResource,
      depth + 1,
      budget,
    );
  if (response.status < 200 || response.status >= 300)
    throw new Error('The detected video requires a session or is no longer available.');
  if (candidate.mediaType !== 'hls') {
    const detected = detectedMedia(candidate.url, response.headers['content-type']);
    if (!detected || !/^(video|audio)\//i.test(response.headers['content-type'] || ''))
      throw new Error('The detected URL did not return playable media.');
    return detected;
  }
  const text = response.body.toString('utf8').trim();
  if (!text.startsWith('#EXTM3U')) throw new Error('The detected playlist is not valid HLS.');
  if (/^#EXT-X-(?:SESSION-)?KEY:(?![^\r\n]*\bMETHOD=NONE(?:,|\s|$))/im.test(text))
    throw new Error('This stream is encrypted. Use an authorized provider player.');
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => line.startsWith('#EXT-X-STREAM-INF:'))) {
    const children = new Set();
    for (let i = 0; i < lines.length - 1; i++) {
      if (
        lines[i].startsWith('#EXT-X-STREAM-INF:') &&
        lines[i + 1] &&
        !lines[i + 1].startsWith('#')
      )
        children.add(pageURL(lines[i + 1], candidate.url).href);
    }
    for (const line of lines) {
      if (!line.startsWith('#EXT-X-MEDIA:')) continue;
      const uri = line.match(/\bURI="([^"]+)"/);
      if (uri) children.add(pageURL(uri[1], candidate.url).href);
    }
    if (!children.size || children.size > 8)
      throw new Error('The detected playlist cannot be safely inspected.');
    for (const url of children)
      await validateMedia({ ...candidate, url }, fetchResource, depth + 1, budget);
    return candidate;
  }
  if (!lines.some((line) => line && !line.startsWith('#')))
    throw new Error('The detected playlist has no media segments.');
  return candidate;
}

async function browserOptions() {
  let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  let args = [];
  if (!executablePath && process.platform === 'linux') {
    const { default: chromium } = await import('@sparticuz/chromium');
    executablePath = await chromium.executablePath();
    args = chromium.args;
  }
  if (!executablePath && process.platform === 'win32') {
    for (const path of [
      `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`,
    ]) {
      try {
        await access(path);
        executablePath = path;
        break;
      } catch {
        /* Try the next installed browser. */
      }
    }
  }
  if (!executablePath)
    throw new Error('JavaScript media detection needs Chromium on the room server.');
  return {
    executablePath,
    headless: true,
    timeout: 8000,
    args: [
      ...args,
      '--proxy-server=http://127.0.0.1:9',
      '--proxy-bypass-list=<-loopback>',
      '--disable-background-networking',
      '--disable-quic',
      '--disable-extensions',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  };
}

let busy = false;
export async function resolveBrowserMedia(
  value,
  { fetchResource = publicResource, timeoutMs = 18000 } = {},
) {
  const url = pageURL(value);
  if (busy) throw new Error('JavaScript media detection is busy. Try again in a moment.');
  busy = true;
  let browser;
  let timer;
  let poll;
  let closed = false;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch(await browserOptions());
    return await Promise.race([
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'No public, unencrypted media was detected. The page may need login, block automation, or require its own player.',
              ),
            ),
          timeoutMs,
        );
      }),
      (async () => {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        let requests = 0,
          bytes = 0,
          title = '',
          inFlight = 0,
          validations = 0;
        const seen = new Set();
        let found;
        const result = new Promise((resolve) => {
          found = resolve;
        });
        page.on('request', (request) => {
          void (async () => {
            try {
              if (
                closed ||
                ++requests > 120 ||
                inFlight >= 6 ||
                bytes > 24 * 1024 ** 2 ||
                request.method() !== 'GET' ||
                ['image', 'font', 'ping'].includes(request.resourceType())
              )
                return await request.abort();
              const resource = pageURL(request.url());
              inFlight++;
              let response;
              try {
                response = await fetchResource(resource.href);
              } finally {
                inFlight--;
              }
              bytes += response.body.length;
              const candidate = detectedMedia(resource.href, response.headers['content-type']);
              if (candidate && !seen.has(candidate.url) && seen.size < 8 && validations < 2) {
                seen.add(candidate.url);
                validations++;
                void validateMedia(candidate, fetchResource)
                  .then(async (media) => {
                    if (!closed)
                      found({ ...media, title: (await page.title()).slice(0, 200) || title });
                  })
                  .catch(() => {})
                  .finally(() => {
                    validations--;
                  });
              }
              if (closed) return;
              await request.respond({
                status: response.status,
                headers: response.headers,
                body: response.body,
              });
            } catch {
              if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => {});
            }
          })().catch(() => {});
        });
        await page.evaluateOnNewDocument(() => {
          // No license acquisition or extraction: encrypted players remain unsupported.
          Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
            value: () =>
              Promise.reject(
                new DOMException(
                  'Encrypted media is not supported by this resolver.',
                  'NotSupportedError',
                ),
              ),
          });
          window.open = () => null;
        });
        void page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
        poll = setInterval(() => {
          if (closed) return;
          void page
            .title()
            .then((value) => {
              title = value.slice(0, 200);
            })
            .catch(() => {});
          for (const frame of page.frames()) {
            void frame
              .evaluate(() => {
                for (const video of document.querySelectorAll('video,audio')) {
                  video.muted = true;
                  void video.play().catch(() => {});
                }
                for (const control of document.querySelectorAll(
                  '.vjs-big-play-button,.jw-display-icon-container .jw-icon-display,button.plyr__control[data-plyr="play"]',
                )) {
                  if (control.dataset.bingeResolverClicked) continue;
                  control.dataset.bingeResolverClicked = 'true';
                  control.click();
                }
              })
              .catch(() => {});
          }
        }, 750);
        return await result;
      })(),
    ]);
  } finally {
    closed = true;
    clearTimeout(timer);
    clearInterval(poll);
    await browser?.close().catch(() => {});
    busy = false;
  }
}
