interface HeaderProps {
  muted: boolean;
  onToggleMute: () => void;
  speechSupported: boolean;
  onHome?: () => void;
}

export function Header({ muted, onToggleMute, speechSupported, onHome }: HeaderProps) {
  return (
    <header className="site-header">
      <button className="brand" onClick={onHome} aria-label="Home">
        <span className="brand-mark" aria-hidden="true">
          ★
        </span>
        <span className="brand-text">
          <span className="brand-title">PREPARING FOR THE OATH</span>
          <span className="brand-sub">U.S. History &amp; Civics Practice Test</span>
        </span>
      </button>

      {speechSupported && (
        <button
          className={`mute-btn ${muted ? "is-muted" : ""}`}
          onClick={onToggleMute}
          aria-pressed={muted}
          title={muted ? "Unmute question audio" : "Mute question audio"}
        >
          <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
          <span>{muted ? "Muted" : "Sound on"}</span>
        </button>
      )}
    </header>
  );
}
