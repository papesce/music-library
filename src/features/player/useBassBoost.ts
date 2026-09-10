import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'playerBassDb';
const MAX_DB = 15;
const FREQ = 120; // Hz lowshelf

function clampDb(v: number) {
  return Math.min(MAX_DB, Math.max(0, Math.round(v)));
}

export function useBassBoost(audioRef: React.RefObject<HTMLAudioElement>) {
  const [bassDb, setBassDbState] = useState(() => {
    const raw = Number(localStorage.getItem(LS_KEY) ?? '0');
    return Number.isFinite(raw) ? clampDb(raw) : 0;
  });
  // bypass = true means preview OFF (hear original); false = preview ON (hear boosted)
  const [bypass, setBypass] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);

  const ensureGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (ctxRef.current && filterRef.current) return;

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctxRef.current = ctx;

    // MediaElementSource can only be created once per element
    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audio);
      } catch {
        // already connected – try to reuse existing context
        return;
      }
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowshelf';
    filter.frequency.value = FREQ;
    filter.gain.value = bypass ? 0 : bassDb;

    // audio -> filter -> destination (keep default audio element output muted from double playback)
    sourceRef.current.connect(filter);
    filter.connect(ctx.destination);

    filterRef.current = filter;

    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* gesture required */ }
    }
  }, [audioRef, bassDb, bypass]);

  const applyGain = useCallback((v: number) => {
    const c = clampDb(v);
    setBassDbState(c);
    if (c > 0 && bypass) setBypass(false);
    if (filterRef.current) {
      const ctx = ctxRef.current;
      const target = bypass ? 0 : c;
      try {
        filterRef.current.gain.setTargetAtTime(target, ctx?.currentTime ?? 0, 0.02);
      } catch {
        filterRef.current.gain.value = target;
      }
    }
    // ensure graph exists if we now need it
    if (c > 0) ensureGraph();
  }, [bypass, ensureGraph]);

  const setBassDb = useCallback((v: number) => {
    const c = clampDb(v);
    localStorage.setItem(LS_KEY, String(c));
    applyGain(c);
  }, [applyGain]);

  const togglePreview = useCallback(async () => {
    if (bassDb === 0) return;
    await ensureGraph();
    const next = !bypass;
    setBypass(next);
    const target = next ? 0 : bassDb;
    const ctx = ctxRef.current;
    if (filterRef.current) {
      try {
        filterRef.current.gain.setTargetAtTime(target, ctx?.currentTime ?? 0, 0.02);
      } catch {
        filterRef.current.gain.value = target;
      }
    }
    if (ctx && ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* needs gesture */ }
    }
  }, [bassDb, bypass, ensureGraph]);

  // keep filter in sync when bassDb/bypass change
  useEffect(() => {
    if (!filterRef.current) return;
    const target = bypass ? 0 : bassDb;
    const ctx = ctxRef.current;
    try {
      filterRef.current.gain.setTargetAtTime(target, ctx?.currentTime ?? 0, 0.02);
    } catch {
      filterRef.current!.gain.value = target;
    }
  }, [bassDb, bypass]);

  // ensure graph is created when bass becomes >0 or audio element mounts
  useEffect(() => {
    if (bassDb > 0) {
      // defer until user gesture; but try to prepare filter lazily
      // actual resume happens on play/preview click
      ensureGraph();
    }
  }, [bassDb, ensureGraph]);

  // resume on play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => {
      if (ctxRef.current?.state === 'suspended') ctxRef.current.resume().catch(() => {});
      if (filterRef.current && bassDb > 0 && !ctxRef.current) {
        ensureGraph();
      }
    };
    audio.addEventListener('play', onPlay);
    return () => audio.removeEventListener('play', onPlay);
  }, [audioRef, bassDb, ensureGraph]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try { filterRef.current?.disconnect(); } catch {}
      try { sourceRef.current?.disconnect(); } catch {}
      // don't close context aggressively – keep for session
    };
  }, []);

  const effectiveDb = bypass ? 0 : bassDb;
  const isPreviewOn = bassDb > 0 && !bypass;

  return { bassDb, setBassDb, applyGain, bypass, isPreviewOn, effectiveDb, togglePreview, ensureGraph, MAX_DB };
}
