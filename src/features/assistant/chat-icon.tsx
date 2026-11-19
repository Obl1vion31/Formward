const glyphs = {
  chevron: <path d="m8 10 4 4 4-4"/>,
  down: <path d="M12 4v16m-7-7 7 7 7-7"/>,
  send: <path d="M12 20V4m-7 7 7-7 7 7"/>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  trash: <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>,
  more: <><circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/></>,
  check: <path d="m5 12 4 4 10-10"/>,
  quote: <path d="M10 8H4v7h5v-4H4m16-3h-6v7h5v-4h-5"/>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  photo: <><rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="8" cy="10" r="1"/><path d="m4 17 5-4 4 3 4-5 4 6"/></>,
};
export function Glyph({ name }: { name: keyof typeof glyphs }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyphs[name]}</svg>;
}
