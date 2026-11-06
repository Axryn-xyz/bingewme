import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { apiUrl } from '../../lib/backend';
type Gif = { id: string; title: string; url: string };
export function GifPicker({
  onPick,
  onClose,
}: {
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(apiUrl(`/api/gifs?q=${encodeURIComponent(query)}`), { signal: abort.signal })
        .then((r) => r.json())
        .then((data) => setGifs(data.gifs || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);
  return (
    <div className="gif-picker">
      <div className="gif-search">
        <Search size={14} />
        <input
          aria-label="Search GIFs"
          placeholder="Find the right reaction…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button title="Close GIF picker" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="gif-grid">
        {gifs.map((g) => (
          <button key={g.id} title={g.title} onClick={() => onPick(g.url)}>
            <img src={g.url} alt={g.title} loading="lazy" />
          </button>
        ))}
      </div>
      <small>
        {loading
          ? 'FINDING GOOD GIFS…'
          : gifs.length
            ? 'POWERED BY GIPHY'
            : 'No matches. Try happy, popcorn, or wow.'}
      </small>
    </div>
  );
}
