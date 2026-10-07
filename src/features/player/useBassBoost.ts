import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'playerBassDb';
const SUB_DB_KEY = 'playerSubBassDb';
const MAX_DB = 6;
const SHELF_HZ = 110;
const SUB_HZ = 48;
const BAND_COUNT = 64;
const FREQUENCIES = Float32Array.from({ length: BAND_COUNT }, (_, i) => 20 * (20000 / 20) ** (i / (BAND_COUNT - 1)));
const SHELF_MAGNITUDE = new Float32Array(BAND_COUNT);
const SUB_MAGNITUDE = new Float32Array(BAND_COUNT);
const FILTER_PHASE = new Float32Array(BAND_COUNT);

export type BassHistoryPoint = { timeSec: number; peakDb: number; levelDb: number; clipping: boolean };
export type BassMeter = { spectrumDb: number[]; responseDb: number[]; combinedDb: number[]; levelDb: number; peakHoldDb: number; clipping: boolean; history: BassHistoryPoint[] };

function clampDb(value: number) {
  return Math.max(0, Math.min(MAX_DB, Math.round(value)));
}

function readDb(key: string) {
  const value = Number(localStorage.getItem(key) ?? '0');
  return Number.isFinite(value) ? clampDb(value) : 0;
}

export function useBassBoost(audioRef: React.RefObject<HTMLAudioElement>) {
  const [bassDb, setBassDbState] = useState(() => readDb(LS_KEY));
  const [subBassDb, setSubBassDbState] = useState(() => readDb(SUB_DB_KEY));
  const [bypass, setBypass] = useState(false);
  const [meter, setMeter] = useState<BassMeter>({ spectrumDb: Array(BAND_COUNT).fill(-100), responseDb: Array(BAND_COUNT).fill(0), combinedDb: Array(BAND_COUNT).fill(-100), levelDb: -60, peakHoldDb: -60, clipping: false, history: [] });

  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const shelfRef = useRef<BiquadFilterNode | null>(null);
  const subRef = useRef<BiquadFilterNode | null>(null);
  const spectrumRef = useRef<AnalyserNode | null>(null);
  const preLimiterRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const meterRef = useRef<BassMeter>({ spectrumDb: Array(BAND_COUNT).fill(-100), responseDb: Array(BAND_COUNT).fill(0), combinedDb: Array(BAND_COUNT).fill(-100), levelDb: -60, peakHoldDb: -60, clipping: false, history: [] });
  const peakHoldUntilRef = useRef(0);
  const clipUntilRef = useRef(0);
  const lastHistorySampleRef = useRef(0);
  const historyRef = useRef<BassHistoryPoint[]>([]);
  const historyPeakDbRef = useRef(-60);
  const historyLevelPowerRef = useRef(0);
  const historyFrameCountRef = useRef(0);
  const historyClipRef = useRef(false);

  const updateMeter = useCallback(() => {
    const ctx = ctxRef.current;
    const spectrum = spectrumRef.current;
    const preLimiter = preLimiterRef.current;
    if (!ctx || !spectrum || !preLimiter) return;

    const preLimiterSamples = new Float32Array(preLimiter.fftSize);
    preLimiter.getFloatTimeDomainData(preLimiterSamples);
    let preLimiterPeak = 0;
    let samplePower = 0;
    for (const sample of preLimiterSamples) {
      const abs = Math.abs(sample);
      preLimiterPeak = Math.max(preLimiterPeak, abs);
      samplePower += sample * sample;
    }
    const peakDb = preLimiterPeak ? 20 * Math.log10(preLimiterPeak) : -60;
    const rms = Math.sqrt(samplePower / preLimiterSamples.length);
    const levelDb = rms ? 20 * Math.log10(rms) : -60;
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      historyPeakDbRef.current = Math.max(historyPeakDbRef.current, peakDb);
      historyLevelPowerRef.current += rms * rms;
      historyFrameCountRef.current++;
      historyClipRef.current ||= preLimiterPeak >= 0.999;
    } else {
      historyPeakDbRef.current = -60;
      historyLevelPowerRef.current = 0;
      historyFrameCountRef.current = 0;
      historyClipRef.current = false;
    }
    const now = performance.now();
    if (preLimiterPeak >= 0.999) {
      peakHoldUntilRef.current = now + 900;
      clipUntilRef.current = now + 700;
    }

    const bins = new Float32Array(spectrum.frequencyBinCount);
    spectrum.getFloatFrequencyData(bins);
    const hzPerBin = ctx.sampleRate / spectrum.fftSize;
    const spectrumDb = Array.from({ length: BAND_COUNT }, (_, band) => {
      const lowHz = 20 * (20000 / 20) ** (band / BAND_COUNT);
      const highHz = 20 * (20000 / 20) ** ((band + 1) / BAND_COUNT);
      const low = Math.max(1, Math.floor(lowHz / hzPerBin));
      const high = Math.min(bins.length - 1, Math.max(low, Math.ceil(highHz / hzPerBin)));
      let power = 0;
      for (let i = low; i <= high; i++) power += 10 ** (bins[i]! / 10);
      const db = 10 * Math.log10(power / Math.max(1, high - low + 1) || 1e-10);
      return Math.max(-100, Math.min(0, db));
    });
    shelfRef.current?.getFrequencyResponse(FREQUENCIES, SHELF_MAGNITUDE, FILTER_PHASE);
    subRef.current?.getFrequencyResponse(FREQUENCIES, SUB_MAGNITUDE, FILTER_PHASE);
    const responseDb = Array.from({ length: BAND_COUNT }, (_, i) => {
      const magnitude = SHELF_MAGNITUDE[i]! * SUB_MAGNITUDE[i]!;
      return magnitude > 0 ? 20 * Math.log10(magnitude) : 0;
    });
    const combinedDb = spectrumDb.map((db, i) => Math.max(-100, Math.min(0, db + responseDb[i]!)));
    const previous = meterRef.current;
    const heldPeak = peakDb >= previous.peakHoldDb
      ? (peakHoldUntilRef.current = now + 900, peakDb)
      : now > peakHoldUntilRef.current ? Math.max(peakDb, previous.peakHoldDb - 0.18) : previous.peakHoldDb;
    const next = {
      spectrumDb: spectrumDb.map((value, i) => previous.spectrumDb[i]! * 0.975 + value * 0.025),
      responseDb,
      combinedDb: combinedDb.map((value, i) => previous.combinedDb[i]! * 0.975 + value * 0.025),
      levelDb: levelDb > previous.levelDb
        ? previous.levelDb * 0.4 + levelDb * 0.6
        : previous.levelDb * 0.82 + levelDb * 0.18,
      peakHoldDb: heldPeak,
      clipping: now < clipUntilRef.current,
      history: previous.history,
    };
    if (audio && !audio.paused && now - lastHistorySampleRef.current >= 100) {
      const historyRms = Math.sqrt(historyLevelPowerRef.current / Math.max(1, historyFrameCountRef.current));
      const point = {
        timeSec: audio.currentTime,
        peakDb: historyPeakDbRef.current,
        levelDb: historyRms ? 20 * Math.log10(historyRms) : levelDb,
        clipping: historyClipRef.current,
      };
      historyRef.current = [...historyRef.current.filter(item => item.timeSec >= point.timeSec - 30), point].slice(-300);
      lastHistorySampleRef.current = now;
      historyPeakDbRef.current = -60;
      historyLevelPowerRef.current = 0;
      historyFrameCountRef.current = 0;
      historyClipRef.current = false;
      next.history = historyRef.current;
    }
    meterRef.current = next;
    setMeter(next);
    frameRef.current = requestAnimationFrame(updateMeter);
  }, [audioRef]);

  const ensureGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || (ctxRef.current && shelfRef.current)) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    if (!sourceRef.current) {
      try { sourceRef.current = ctx.createMediaElementSource(audio); }
      catch { return; }
    }

    const shelf = ctx.createBiquadFilter();
    shelf.type = 'lowshelf';
    shelf.frequency.value = SHELF_HZ;
    shelf.gain.value = bypass ? 0 : bassDb;
    const sub = ctx.createBiquadFilter();
    sub.type = 'lowshelf';
    sub.frequency.value = SUB_HZ;
    sub.gain.value = bypass ? 0 : subBassDb;
    const spectrum = ctx.createAnalyser();
    spectrum.fftSize = 8192;
    spectrum.smoothingTimeConstant = 0.72;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    const preLimiter = ctx.createAnalyser();
    preLimiter.fftSize = 2048;

    // This analyser is tapped before EQ so the song profile stays an honest reference.
    sourceRef.current.connect(spectrum);
    sourceRef.current.connect(shelf);
    shelf.connect(sub);
    sub.connect(preLimiter);
    preLimiter.connect(limiter);
    limiter.connect(ctx.destination);
    shelfRef.current = shelf;
    subRef.current = sub;
    spectrumRef.current = spectrum;
    preLimiterRef.current = preLimiter;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* playback gesture may be required */ }
    }
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(updateMeter);
  }, [audioRef, bassDb, bypass, subBassDb, updateMeter]);

  const applyGain = useCallback((value: number) => {
    const next = clampDb(value);
    setBassDbState(next);
    const nextBypass = next > 0 ? false : bypass;
    if (nextBypass !== bypass) setBypass(nextBypass);
    const ctx = ctxRef.current;
    if (shelfRef.current) shelfRef.current.gain.setTargetAtTime(nextBypass ? 0 : next, ctx?.currentTime ?? 0, 0.025);
    if (next > 0 || subBassDb > 0) void ensureGraph();
  }, [bypass, ensureGraph, subBassDb]);

  const setBassDb = useCallback((value: number) => {
    const next = clampDb(value);
    localStorage.setItem(LS_KEY, String(next));
    applyGain(next);
  }, [applyGain]);

  const setSubBassDb = useCallback((value: number) => {
    const next = clampDb(value);
    setSubBassDbState(next);
    localStorage.setItem(SUB_DB_KEY, String(next));
    const nextBypass = next > 0 ? false : bypass;
    if (nextBypass !== bypass) setBypass(nextBypass);
    const ctx = ctxRef.current;
    if (subRef.current) subRef.current.gain.setTargetAtTime(nextBypass ? 0 : next, ctx?.currentTime ?? 0, 0.025);
    if (next > 0 || bassDb > 0) void ensureGraph();
  }, [bassDb, bypass, ensureGraph]);

  const togglePreview = useCallback(async () => {
    if (bassDb === 0 && subBassDb === 0) return;
    await ensureGraph();
    const nextBypass = !bypass;
    setBypass(nextBypass);
    const ctx = ctxRef.current;
    if (shelfRef.current) shelfRef.current.gain.setTargetAtTime(nextBypass ? 0 : bassDb, ctx?.currentTime ?? 0, 0.025);
    if (subRef.current) subRef.current.gain.setTargetAtTime(nextBypass ? 0 : subBassDb, ctx?.currentTime ?? 0, 0.025);
    if (ctx?.state === 'suspended') {
      try { await ctx.resume(); } catch { /* playback gesture may be required */ }
    }
  }, [bassDb, bypass, ensureGraph, subBassDb]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const resetHistory = () => {
      historyRef.current = [];
      lastHistorySampleRef.current = 0;
      historyPeakDbRef.current = -60;
      historyLevelPowerRef.current = 0;
      historyFrameCountRef.current = 0;
      historyClipRef.current = false;
      meterRef.current = { ...meterRef.current, history: [] };
      setMeter(current => ({ ...current, history: [] }));
    };
    const onPlay = () => {
      if (!shelfRef.current) void ensureGraph();
      else if (ctxRef.current?.state === 'suspended') void ctxRef.current.resume();
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('loadedmetadata', resetHistory);
    audio.addEventListener('seeking', resetHistory);
    audio.addEventListener('emptied', resetHistory);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('loadedmetadata', resetHistory);
      audio.removeEventListener('seeking', resetHistory);
      audio.removeEventListener('emptied', resetHistory);
    };
  }, [audioRef, ensureGraph]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    try { sourceRef.current?.disconnect(); } catch { /* already disconnected */ }
  }, []);

  return {
    bassDb, setBassDb, applyGain, subBassDb, setSubBassDb,
    bypass, isPreviewOn: (bassDb > 0 || subBassDb > 0) && !bypass,
    togglePreview, ensureGraph, MAX_DB,
    meter,
  };
}
