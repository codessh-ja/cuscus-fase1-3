export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-[var(--line)] flex items-center px-4 sm:px-6 py-2 text-[9px] text-bone-2 bg-[rgba(0,0,0,0.48)] shrink-0" style={{ borderColor: 'rgba(235,230,219,0.06)' }}>
      <div className="flex items-center gap-3">
        {/* Instagram */}
        <a
          className="flex items-center gap-[7px] font-mono tracking-[0.14em] uppercase hover:text-bone transition-colors"
          href="https://instagram.com/cuscushats_"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="w-6 h-6 sm:w-7 sm:h-7 border border-[var(--line)] grid place-items-center shrink-0 hover:border-[var(--line-strong)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
            </svg>
          </span>
          <span className="text-[8px] sm:text-[9px]">@cuscushats_</span>
        </a>

        {/* TikTok */}
        <a
          className="flex items-center gap-[7px] font-mono tracking-[0.14em] uppercase hover:text-bone transition-colors"
          href="https://tiktok.com/@cuscus.hats"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="w-6 h-6 sm:w-7 sm:h-7 border border-[var(--line)] grid place-items-center shrink-0 hover:border-[var(--line-strong)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
            </svg>
          </span>
          <span className="text-[8px] sm:text-[9px]">@cuscus.hats</span>
        </a>
      </div>

      {/* Centro — absolutamente centrado independiente del contenido lateral */}
      <div className="absolute left-1/2 -translate-x-1/2 hidden sm:flex gap-8 items-center font-mono tracking-[0.18em] uppercase pointer-events-none select-none whitespace-nowrap" style={{ opacity: 0.55 }}>
        <span>Ediciones limitadas</span>
        <span className="w-1.5 h-1.5 bg-bone-2 rotate-45 opacity-60 inline-block" />
        <span>Hecho para soñadores</span>
      </div>

      <div className="ml-auto" />

      {/* Admin — fijo esquina inferior derecha */}
      <a
        href="/admin"
        title="Admin"
        className="fixed bottom-3 right-3 z-50 w-7 h-7 border border-[var(--line)] grid place-items-center text-bone-2 hover:text-bone hover:border-[var(--line-strong)] transition-all duration-200 opacity-20 hover:opacity-100 bg-[rgba(0,0,0,0.6)]"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="10" width="14" height="10" rx="1" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </a>
    </footer>
  );
}
