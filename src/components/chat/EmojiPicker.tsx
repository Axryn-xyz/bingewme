import { useEffect, useRef, useState } from 'react';
import Picker from 'emoji-picker-react';
import { Star, X } from 'lucide-react';
import '../../styles/emoji.css';

export default function EmojiPicker({
  favorites,
  onFavorite,
  onPick,
  onClose,
  mode,
}: {
  favorites: string[];
  onFavorite: (emoji: string) => void;
  onPick: (emoji: string) => void;
  onClose: () => void;
  mode: 'reaction' | 'chat';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(favorites[0] || '🍿');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const choose = (emoji: string) => {
    setSelected(emoji);
    onPick(emoji);
  };
  return (
    <dialog
      ref={dialog}
      className="emoji-dialog"
      aria-labelledby="emoji-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="emoji-dialog-content">
        <header>
          <div>
            <h2 id="emoji-title">{mode === 'reaction' ? 'React your way.' : 'Find your emoji.'}</h2>
            <p>Your favorites. Your kind of chaos.</p>
          </div>
          <button className="emoji-close" aria-label="Close emoji picker" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <section className="emoji-favorites" aria-label="Favorite emojis">
          <span>
            <Star size={12} /> FAVORITES
          </span>
          <div className="emoji-favorite-list">
            {favorites.map((emoji) => (
              <div className="emoji-favorite" key={emoji}>
                <button title={`Use ${emoji}`} onClick={() => choose(emoji)}>
                  {emoji}
                </button>
                <button
                  className="emoji-unfavorite"
                  aria-label={`Remove ${emoji} from favorites`}
                  onClick={() => onFavorite(emoji)}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {!favorites.length && <p>Choose an emoji below, then star it.</p>}
          </div>
          <small>Your first five favorites become your quick reactions.</small>
        </section>
        <Picker
          width="100%"
          height={340}
          emojiStyle="native"
          colorScheme="dark"
          previewConfig={{ showPreview: false }}
          onEmojiClick={({ emoji }) => choose(emoji)}
        />
        <div className="emoji-picker-footer">
          <span className="emoji-selected">{selected}</span>
          <button
            className="outline-btn"
            aria-pressed={favorites.includes(selected)}
            onClick={() => onFavorite(selected)}
          >
            <Star size={15} fill={favorites.includes(selected) ? 'currentColor' : 'none'} />
            {favorites.includes(selected) ? 'Unfavorite' : 'Add to favorites'}
          </button>
          <span>Saved on this device</span>
        </div>
      </div>
    </dialog>
  );
}
