import type { ReactNode } from 'react';

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightMatch(text: string, query: string): ReactNode {
  if (!query || !text) return text;
  const q = query.trim();
  if (!q) return text;
  const re = new RegExp(`(${escapeRegExp(q)})`, 'ig');
  const parts = text.split(re);
  // split includes delimiters; match case-insensitively but preserve original casing
  const lowerQ = q.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === lowerQ ? (
      <mark key={i} className="search-match">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
