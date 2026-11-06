export const DEFAULT_ACCENT = '#e7ff66';
const STORAGE_KEY = 'binge-w-me-accent';
const validHex = /^#[\da-f]{6}$/i;

function rgb(hex: string): number[] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

export function contrastRatio(a: string, b: string): number {
  const luminance = (color: string) =>
    rgb(color)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function hueOf(hex: string): number {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  if (!delta) return 0;
  const sector =
    max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}

function hsl(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  const channels =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return (
    '#' +
    channels
      .map((channel) =>
        Math.round((channel + offset) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Preserve the chosen accent; derive low-saturation surfaces and readable foregrounds. */
export function createTheme(input: string): Record<string, string> {
  const accent = validHex.test(input) ? input.toLowerCase() : DEFAULT_ACCENT;
  const hue = hueOf(accent);
  const channels = rgb(accent);
  const neutral = Math.max(...channels) - Math.min(...channels) < 0.035;
  const tint = neutral ? 0 : 1;
  const shade = (saturation: number, lightness: number) => hsl(hue, saturation * tint, lightness);
  const active = shade(0.22, 0.17);
  const readable = (color: string, minimum = 4.5) => {
    let candidate = color;
    for (let step = 0; contrastRatio(candidate, active) < minimum && step <= 100; step++) {
      const amount = step / 100;
      candidate =
        '#' +
        rgb(color)
          .map((channel) =>
            Math.round((channel + (1 - channel) * amount) * 255)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
    }
    return candidate;
  };
  return {
    '--accent': accent,
    '--on-accent':
      contrastRatio(accent, '#090909') >= contrastRatio(accent, '#ffffff') ? '#090909' : '#ffffff',
    '--accent-text': readable(accent),
    '--accent-soft': shade(0.4, 0.82),
    '--accent-shadow': shade(0.28, 0.27),
    '--surface-base': shade(0.09, 0.065),
    '--surface-panel': shade(0.13, 0.09),
    '--surface-raised': shade(0.18, 0.12),
    '--surface-active': active,
    '--border': shade(0.12, 0.27),
    '--border-strong': shade(0.16, 0.43),
    '--text-faint': readable(shade(0.1, 0.59)),
    '--text-muted': readable(shade(0.1, 0.68)),
    '--text-secondary': readable(shade(0.1, 0.8)),
    '--text-primary': shade(0.08, 0.94),
    '--shadow': '#050505',
    '--danger-text': '#ffacbd',
  };
}

export function readAccent(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && validHex.test(saved) ? saved : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function applyTheme(accent: string, persist = false): void {
  const palette = createTheme(accent);
  for (const [token, value] of Object.entries(palette))
    document.documentElement.style.setProperty(token, value);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', palette['--surface-base']);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, palette['--accent']);
    } catch {
      /* Theme still works when storage is unavailable. */
    }
  }
}
