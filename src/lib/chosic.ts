export async function copyThenOpenChosic(title: string, artist?: string) {
  const q =
    artist?.trim() && title?.trim()
      ? `${artist.trim()} - ${title.trim()}`
      : title?.trim() || artist?.trim() || '';
  if (q) {
    try {
      await navigator.clipboard.writeText(q);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = q;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }
  window.open('https://www.chosic.com/playlist-generator/', '_blank');
}
