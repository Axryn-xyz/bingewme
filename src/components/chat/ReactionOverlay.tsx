export interface Reaction {
  id: string;
  emoji: string;
  x: number;
}
export function ReactionOverlay({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="reaction-overlay" aria-hidden="true">
      {reactions.map((r) => (
        <span key={r.id} style={{ left: `${r.x}%` }}>
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
