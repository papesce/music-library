import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'playerBassDb';
const MAX_DB = 15;
const FREQ = 120; // Hz lowshelf
const HEADROOM_KEY = 'playerBassHeadroom';

export type BassMeter = { bands: number[]; peakDb: number; clipping: boolean };

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
  const [headroom, setHeadroom] = useState(() => localStorage.getItem(HEADROOM_KEY) !== 'false');
  const [meter, setMeter] = useState<BassMeter>({ bands: Array(24).fill(0), peakDb: -60, clipping: false });

  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const meterRef = useRef<BassMeter>({ bands: Array(24).fill(0), peakDb: -60, clipping: false });
  const headroomGainRef = useRef<GainNode | null>(null);

  const setHeadroomCompensation = useCallback((enabled: boolean) => {
    setHeadroom(enabled);
    localStorage.setItem(HEADROOM_KEY, String(enabled));
    const ctx = ctxRef.current;
    if (headroomGainRef.current && ctx) {
      const compensationDb = enabled && !bypass ? -bassDb : 0;
      headroomGainRef.current.gain.setTargetAtTime(Math.pow(10, compensationDb / 20), ctx.currentTime, 0.03);
    }
  }, [bassDb, bypass]);

  const updateMeter = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    if (!analyser || !ctx) return;
    const outputAnalyser = outputAnalyserRef.current;
    if (!outputAnalyser) return;
    const data = new Float32Array(outputAnalyser.fftSize);
    outputAnalyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -60;

    const spectrum = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(spectrum);
    const hzPerBin = ctx.sampleRate / analyser.fftSize;
    const bands = Array.from({ length: 24 }, (_, band) => {
      const lowHz = 25 * Math.pow(150 / 25, band / 24);
      const highHz = 25 * Math.pow(150 / 25, (band + 1) / 24);
      const lowBin = Math.max(1, Math.floor(lowHz / hzPerBin));
      const highBin = Math.min(spectrum.length - 1, Math.max(lowBin, Math.ceil(highHz / hzPerBin)));
      let sum = 0;
      for (let i = lowBin; i <= highBin; i++) sum += Math.pow(10, spectrum[i]! / 10);
      const levelDb = 10 * Math.log10(sum / (highBin - lowBin + 1) || 1e-10);
      return Math.max(0, Math.min(1, (levelDb + 90) / 75));
    });
    const next = { bands, peakDb, clipping: peak >= 0.999 };
    const prev = meterRef.current;
    // Smooth the display and retain the clipping indicator briefly for visibility.
    const smoothed = { bands: bands.map((value, i) => prev.bands[i]! * 0.55 + value * 0.45), peakDb: prev.peakDb * 0.55 + next.peakDb * 0.45, clipping: next.clipping || (prev.clipping && peakDb > -1.5) };
    meterRef.current = smoothed;
    setMeter(smoothed);
    meterFrameRef.current = requestAnimationFrame(updateMeter);
  }, []);

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

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    const headroomGain = ctx.createGain();
    const outputAnalyser = ctx.createAnalyser();
    outputAnalyser.fftSize = 2048;
    const initialDb = headroom && !bypass ? -bassDb : 0;
    headroomGain.gain.value = Math.pow(10, initialDb / 20);

    // audio -> low shelf -> bass spectrum -> safety headroom -> output peak meter -> destination
    sourceRef.current.connect(filter);
    filter.connect(analyser);
    analyser.connect(headroomGain);
    headroomGain.connect(outputAnalyser);
    outputAnalyser.connect(ctx.destination);

    filterRef.current = filter;
    analyserRef.current = analyser;
    outputAnalyserRef.current = outputAnalyser;
    headroomGainRef.current = headroomGain;

    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* gesture required */ }
    }
    if (meterFrameRef.current === null) meterFrameRef.current = requestAnimationFrame(updateMeter);
  }, [audioRef, bassDb, bypass, headroom, updateMeter]);

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
    if (headroomGainRef.current && ctxRef.current) {
      const compensationDb = headroom && !bypass ? -c : 0;
      headroomGainRef.current.gain.setTargetAtTime(Math.pow(10, compensationDb / 20), ctxRef.current.currentTime, 0.03);
    }
    // ensure graph exists if we now need it
    if (c > 0) ensureGraph();
  }, [bypass, ensureGraph, headroom]);

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
    if (headroomGainRef.current && ctx) {
      const compensationDb = headroom && !next ? -bassDb : 0;
      headroomGainRef.current.gain.setTargetAtTime(Math.pow(10, compensationDb / 20), ctx.currentTime, 0.03);
    }
    if (ctx && ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* needs gesture */ }
    }
  }, [bassDb, bypass, ensureGraph, headroom]);

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
    if (headroomGainRef.current && ctx) {
      const compensationDb = headroom && !bypass ? -bassDb : 0;
      headroomGainRef.current.gain.setTargetAtTime(Math.pow(10, compensationDb / 20), ctx.currentTime, 0.03);
    }
  }, [bassDb, bypass, headroom]);

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
      if (!filterRef.current) {
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
      if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
      // don't close context aggressively – keep for session
    };
  }, []);

  const effectiveDb = bypass ? 0 : bassDb;
  const isPreviewOn = bassDb > 0 && !bypass;

  return { bassDb, setBassDb, applyGain, bypass, isPreviewOn, effectiveDb, togglePreview, ensureGraph, MAX_DB, headroom, setHeadroomCompensation, meter };
}
