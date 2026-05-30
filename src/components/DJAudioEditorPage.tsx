import React, { useEffect, useRef, useState } from 'react';
import { Disc3, MoveHorizontal, Pause, Play, RotateCcw, SkipBack, Upload, X } from 'lucide-react';
import { defaultFx, type FxParams, SlotChannel } from '../audio';
import { cn } from '../lib/utils';
import {
  DJ_FX_CONTROLS,
  DJ_PERSISTENCE_KEY,
  PERSISTENCE_STATE_VERSION,
  PERSISTENCE_SYNC_CHANNEL,
  PERSISTENCE_SYNC_STORAGE_KEY,
  createDjTrackId,
  createIdFragment,
  decodePersistedAudioBuffer,
  deletePersistedSnapshot,
  emitPersistenceSync,
  encodePersistedAudioBuffer,
  formatDjTime,
  isQuotaExceededError,
  makeFx,
  readPersistedSnapshot,
  writePersistedSnapshot,
  type PersistedDJState,
  type PersistedDJTrack,
  type PersistedSnapshot,
  type PersistenceSyncMessage,
  type ScratchEdit,
} from '../app/model';

export function DJAudioEditorPage({ onBack }: { onBack: () => void }) {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [djTracks, setDjTracks] = useState<PersistedDJTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [fileName, setFileName] = useState('No audio loaded');
  const [djPosition, setDjPosition] = useState(0);
  const [isDjPlaying, setIsDjPlaying] = useState(false);
  const [isReverse, setIsReverse] = useState(false);
  const [djBpm, setDjBpm] = useState(120);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [djFx, setDjFx] = useState<FxParams>(() => makeFx({ volume: 92, compressor: 12 }));
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const channelRef = useRef<SlotChannel | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const djTracksRef = useRef<PersistedDJTrack[]>([]);
  const activeTrackIdRef = useRef<string | null>(null);
  const reverseBufferRef = useRef<AudioBuffer | null>(null);
  const animationRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const basePositionRef = useRef(0);
  const positionRef = useRef(0);
  const isPlayingRef = useRef(false);
  const reverseRef = useRef(false);
  const speedRef = useRef(1);
  const fxRef = useRef(djFx);
  const effectiveRateRef = useRef(1);
  const scratchEditRef = useRef<ScratchEdit | null>(null);
  const persistenceSourceIdRef = useRef(`dj-${createIdFragment()}`);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedPersistenceRef = useRef(false);
  const isApplyingPersistenceRef = useRef(false);
  const lastPersistenceUpdateRef = useRef(0);
  const quotaWarningShownRef = useRef(false);

  const duration = audioBuffer?.duration ?? 0;
  const activeTrack = djTracks.find((track) => track.id === activeTrackId) ?? null;

  const ensureAudioGraph = () => {
    const AudioContextClass = window.AudioContext;
    const ctx = ctxRef.current ?? new AudioContextClass();
    ctxRef.current = ctx;
    if (!channelRef.current) {
      channelRef.current = new SlotChannel(ctx, ctx.destination);
      channelRef.current.applyParams(fxRef.current);
      channelRef.current.sidechainLFO.frequency.setValueAtTime(djBpm / 60, ctx.currentTime);
    }
    return { ctx, channel: channelRef.current };
  };

  const clampPosition = (value: number) => Math.max(0, Math.min(value, audioBufferRef.current?.duration ?? 0));

  const getEffectiveRate = () => Math.max(0.05, speedRef.current * Math.pow(2, fxRef.current.pitch / 12));

  const updateSourceRate = () => {
    const rate = getEffectiveRate();
    effectiveRateRef.current = rate;
    const source = sourceRef.current;
    const ctx = ctxRef.current;
    if (source && ctx) {
      source.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.02);
    }
  };

  const getReverseBuffer = () => {
    const buffer = audioBufferRef.current;
    if (!buffer) return null;
    if (reverseBufferRef.current) return reverseBufferRef.current;
    const { ctx } = ensureAudioGraph();
    const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const src = buffer.getChannelData(channel);
      const dst = reversed.getChannelData(channel);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i];
      }
    }
    reverseBufferRef.current = reversed;
    return reversed;
  };

  const getPlaybackBuffer = (reverse = reverseRef.current) => reverse ? getReverseBuffer() : audioBufferRef.current;

  const getLivePosition = () => {
    const buffer = audioBufferRef.current;
    const ctx = ctxRef.current;
    if (!buffer || !ctx || !isPlayingRef.current) return positionRef.current;
    const elapsed = (ctx.currentTime - startedAtRef.current) * effectiveRateRef.current;
    const next = reverseRef.current ? basePositionRef.current - elapsed : basePositionRef.current + elapsed;
    return Math.max(0, Math.min(buffer.duration, next));
  };

  const clearAnimation = () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const stopCurrentSource = () => {
    const source = sourceRef.current;
    if (!source) return;
    sourceRef.current = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Source may already be stopped by the audio engine.
    }
    source.disconnect();
  };

  const syncPosition = (next: number) => {
    const clamped = clampPosition(next);
    positionRef.current = clamped;
    setDjPosition(clamped);
    return clamped;
  };

  const createDjPersistenceData = (includeAudio: boolean): PersistedDJState => ({
    tracks: djTracksRef.current.map((track) => ({
      ...track,
      audio: includeAudio ? track.audio : undefined,
    })),
    activeTrackId: activeTrackIdRef.current,
    position: positionRef.current,
    isReverse,
    bpm: djBpm,
    playbackSpeed,
    fx: djFx,
  });

  const persistDjState = async (includeAudio = true) => {
    if (!hasHydratedPersistenceRef.current || isApplyingPersistenceRef.current) return;
    const updatedAt = Date.now();
    const snapshot: PersistedSnapshot<PersistedDJState> = {
      version: PERSISTENCE_STATE_VERSION,
      updatedAt,
      data: createDjPersistenceData(includeAudio),
      degraded: !includeAudio,
    };

    try {
      await writePersistedSnapshot(DJ_PERSISTENCE_KEY, snapshot);
      lastPersistenceUpdateRef.current = updatedAt;
      emitPersistenceSync({ key: DJ_PERSISTENCE_KEY, updatedAt, sourceId: persistenceSourceIdRef.current });
    } catch (err) {
      if (includeAudio && isQuotaExceededError(err)) {
        if (!quotaWarningShownRef.current) {
          quotaWarningShownRef.current = true;
          alert('浏览器本地存储空间不足，已优先保留最新编辑参数；当前上传音频可能无法完整缓存。');
        }
        await persistDjState(false);
        return;
      }
      console.error('DJ persistence failed', err);
    }
  };

  const queueDjPersistence = () => {
    if (!hasHydratedPersistenceRef.current || isApplyingPersistenceRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      persistDjState();
    }, 700);
  };

  const applyDjPersistedState = async (snapshot: PersistedSnapshot<PersistedDJState>) => {
    isApplyingPersistenceRef.current = true;
    try {
      pauseDjPlayback();
      const data = snapshot.data;
      const restoredTracks = Array.isArray(data.tracks)
        ? data.tracks
        : data.audio
          ? [{
              id: createDjTrackId(),
              fileName: data.fileName ?? 'Restored audio',
              duration: data.audio.duration,
              audio: data.audio,
            }]
          : [];
      const nextActiveId = data.activeTrackId && restoredTracks.some((track) => track.id === data.activeTrackId)
        ? data.activeTrackId
        : restoredTracks[0]?.id ?? null;
      const currentTrack = restoredTracks.find((track) => track.id === nextActiveId) ?? null;
      let restoredBuffer: AudioBuffer | null = null;
      if (currentTrack?.audio) {
        const { ctx } = ensureAudioGraph();
        restoredBuffer = await decodePersistedAudioBuffer(ctx, currentTrack.audio);
      }

      djTracksRef.current = restoredTracks;
      activeTrackIdRef.current = nextActiveId;
      audioBufferRef.current = restoredBuffer;
      reverseBufferRef.current = null;
      setDjTracks(restoredTracks);
      setActiveTrackId(nextActiveId);
      setAudioBuffer(restoredBuffer);
      setFileName(currentTrack ? currentTrack.fileName : 'No audio loaded');
      const nextPosition = Math.max(0, Math.min(data.position || 0, restoredBuffer?.duration ?? 0));
      syncPosition(nextPosition);
      reverseRef.current = data.isReverse;
      setIsReverse(data.isReverse);
      speedRef.current = data.playbackSpeed || 1;
      setPlaybackSpeed(data.playbackSpeed || 1);
      setDjBpm(data.bpm || 120);
      const nextFx = { ...defaultFx(), ...data.fx };
      fxRef.current = nextFx;
      setDjFx(nextFx);
      channelRef.current?.applyParams(nextFx);
      if (channelRef.current && ctxRef.current) {
        channelRef.current.sidechainLFO.frequency.setTargetAtTime((data.bpm || 120) / 60, ctxRef.current.currentTime, 0.05);
      }
      lastPersistenceUpdateRef.current = snapshot.updatedAt;
    } finally {
      isApplyingPersistenceRef.current = false;
    }
  };

  const resetDjEditorState = async (emit = true) => {
    pauseDjPlayback();
    audioBufferRef.current = null;
    djTracksRef.current = [];
    activeTrackIdRef.current = null;
    reverseBufferRef.current = null;
    setDjTracks([]);
    setActiveTrackId(null);
    setAudioBuffer(null);
    setFileName('No audio loaded');
    syncPosition(0);
    reverseRef.current = false;
    setIsReverse(false);
    speedRef.current = 1;
    setPlaybackSpeed(1);
    setDjBpm(120);
    const nextFx = makeFx({ volume: 92, compressor: 12 });
    fxRef.current = nextFx;
    setDjFx(nextFx);
    channelRef.current?.applyParams(nextFx);
    const updatedAt = Date.now();
    lastPersistenceUpdateRef.current = updatedAt;
    await deletePersistedSnapshot(DJ_PERSISTENCE_KEY);
    if (emit) {
      emitPersistenceSync({ key: DJ_PERSISTENCE_KEY, updatedAt, sourceId: persistenceSourceIdRef.current, cleared: true });
    }
  };

  const loadDjTrackById = async (
    trackId: string,
    options: { autoplay?: boolean; position?: number; keepReverse?: boolean } = {}
  ) => {
    const track = djTracksRef.current.find((item) => item.id === trackId);
    if (!track) return false;
    if (!track.audio) {
      alert('该曲目的音频缓存缺失，请重新上传后再播放。');
      return false;
    }

    const wasPlaying = isPlayingRef.current;
    if (wasPlaying) pauseDjPlayback();
    setIsLoadingAudio(true);
    try {
      const { ctx } = ensureAudioGraph();
      const buffer = await decodePersistedAudioBuffer(ctx, track.audio);
      activeTrackIdRef.current = track.id;
      audioBufferRef.current = buffer;
      reverseBufferRef.current = null;
      setActiveTrackId(track.id);
      setAudioBuffer(buffer);
      setFileName(track.fileName);
      syncPosition(Math.max(0, Math.min(options.position ?? 0, buffer.duration)));
      if (!options.keepReverse) {
        reverseRef.current = false;
        setIsReverse(false);
      }
      if (options.autoplay) {
        requestAnimationFrame(() => startDjPlayback(positionRef.current, reverseRef.current));
      }
      return true;
    } catch (err) {
      console.error('DJ track load failed', err);
      alert('曲目加载失败，请重新上传该音频。');
      return false;
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const getNextDjTrack = () => {
    const tracks = djTracksRef.current;
    const currentIndex = tracks.findIndex((track) => track.id === activeTrackIdRef.current);
    if (currentIndex === -1) return null;
    return tracks.slice(currentIndex + 1).find((track) => track.audio) ?? null;
  };

  const finishDjTrack = () => {
    const buffer = audioBufferRef.current;
    const shouldAdvance = !reverseRef.current;
    clearAnimation();
    stopCurrentSource();
    isPlayingRef.current = false;
    setIsDjPlaying(false);

    if (shouldAdvance) {
      const nextTrack = getNextDjTrack();
      if (nextTrack) {
        syncPosition(buffer?.duration ?? positionRef.current);
        loadDjTrackById(nextTrack.id, { autoplay: true, position: 0, keepReverse: true });
        return;
      }
    }

    syncPosition(reverseRef.current ? 0 : buffer?.duration ?? positionRef.current);
  };

  const selectDjTrackForPlayback = async (trackId: string) => {
    if (trackId === activeTrackIdRef.current && audioBufferRef.current) {
      startDjPlayback(positionRef.current, reverseRef.current);
      return;
    }
    await loadDjTrackById(trackId, { autoplay: true, position: 0, keepReverse: true });
  };

  const removeDjTrack = async (event: React.MouseEvent<HTMLButtonElement>, trackId: string) => {
    event.stopPropagation();
    const tracks = djTracksRef.current;
    const removeIndex = tracks.findIndex((track) => track.id === trackId);
    if (removeIndex === -1) return;
    const nextTracks = tracks.filter((track) => track.id !== trackId);
    djTracksRef.current = nextTracks;
    setDjTracks(nextTracks);

    if (trackId !== activeTrackIdRef.current) return;

    pauseDjPlayback();
    const nextTrack = nextTracks[Math.min(removeIndex, nextTracks.length - 1)] ?? null;
    if (nextTrack) {
      await loadDjTrackById(nextTrack.id, { position: 0, keepReverse: true });
      return;
    }

    activeTrackIdRef.current = null;
    audioBufferRef.current = null;
    reverseBufferRef.current = null;
    setActiveTrackId(null);
    setAudioBuffer(null);
    setFileName('No audio loaded');
    syncPosition(0);
  };

  const reorderDjTrack = (draggedId: string, targetId: string, placement: 'before' | 'after' = 'before') => {
    if (draggedId === targetId) return;
    setDjTracks((current) => {
      const fromIndex = current.findIndex((track) => track.id === draggedId);
      const toIndex = current.findIndex((track) => track.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return current;
      const next = [...current];
      const [dragged] = next.splice(fromIndex, 1);
      const targetIndex = next.findIndex((track) => track.id === targetId);
      next.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, dragged);
      djTracksRef.current = next;
      return next;
    });
  };

  const tickPlayback = () => {
    const next = syncPosition(getLivePosition());
    const buffer = audioBufferRef.current;
    if (!buffer) return;
    if ((!reverseRef.current && next >= buffer.duration - 0.01) || (reverseRef.current && next <= 0.01)) {
      finishDjTrack();
      return;
    }
    animationRef.current = requestAnimationFrame(tickPlayback);
  };

  const anchorLivePlayback = () => {
    if (!isPlayingRef.current || !ctxRef.current) return;
    const live = syncPosition(getLivePosition());
    basePositionRef.current = live;
    startedAtRef.current = ctxRef.current.currentTime;
  };

  const startDjPlayback = async (position = positionRef.current, reverse = reverseRef.current) => {
    const baseBuffer = audioBufferRef.current;
    if (!baseBuffer) return;
    const { ctx, channel } = ensureAudioGraph();
    await ctx.resume();
    stopCurrentSource();
    clearAnimation();

    const buffer = getPlaybackBuffer(reverse);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const rate = getEffectiveRate();
    effectiveRateRef.current = rate;
    source.playbackRate.value = rate;
    source.connect(channel.input);

    const startPosition = reverse
      ? (position <= 0.01 ? baseBuffer.duration : clampPosition(position))
      : (position >= baseBuffer.duration - 0.01 ? 0 : clampPosition(position));
    const offset = reverse
      ? Math.max(0, Math.min(baseBuffer.duration - 0.01, baseBuffer.duration - startPosition))
      : Math.max(0, Math.min(baseBuffer.duration - 0.01, startPosition));

    source.onended = () => {
      if (sourceRef.current !== source) return;
      finishDjTrack();
    };

    sourceRef.current = source;
    reverseRef.current = reverse;
    basePositionRef.current = startPosition;
    startedAtRef.current = ctx.currentTime;
    syncPosition(startPosition);
    isPlayingRef.current = true;
    setIsDjPlaying(true);
    source.start(0, offset);
    animationRef.current = requestAnimationFrame(tickPlayback);
  };

  const pauseDjPlayback = () => {
    const live = getLivePosition();
    clearAnimation();
    stopCurrentSource();
    isPlayingRef.current = false;
    setIsDjPlaying(false);
    syncPosition(live);
  };

  const seekDjPosition = (next: number) => {
    const wasPlaying = isPlayingRef.current;
    if (wasPlaying) {
      startDjPlayback(next);
    } else {
      syncPosition(next);
    }
  };

  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    const files: File[] = fileList ? Array.from(fileList as ArrayLike<File>) : [];
    if (!files.length) return;
    setIsLoadingAudio(true);
    try {
      const { ctx } = ensureAudioGraph();
      const nextTracks: PersistedDJTrack[] = [];
      let firstLoadedBuffer: AudioBuffer | null = null;
      let firstLoadedTrack: PersistedDJTrack | null = null;

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        const track: PersistedDJTrack = {
          id: createDjTrackId(),
          fileName: file.name,
          duration: buffer.duration,
          audio: encodePersistedAudioBuffer(buffer),
        };
        nextTracks.push(track);
        if (!firstLoadedTrack) {
          firstLoadedTrack = track;
          firstLoadedBuffer = buffer;
        }
      }

      setDjTracks((current) => {
        const merged = [...current, ...nextTracks];
        djTracksRef.current = merged;
        return merged;
      });

      if (!activeTrackIdRef.current && firstLoadedTrack && firstLoadedBuffer) {
        activeTrackIdRef.current = firstLoadedTrack.id;
        audioBufferRef.current = firstLoadedBuffer;
        reverseBufferRef.current = null;
        setActiveTrackId(firstLoadedTrack.id);
        setAudioBuffer(firstLoadedBuffer);
        setFileName(firstLoadedTrack.fileName);
        syncPosition(0);
        setIsReverse(false);
        reverseRef.current = false;
      }
    } catch (err) {
      console.error('DJ audio load failed', err);
      alert('音频加载失败，请换一个音频文件再试。');
    } finally {
      setIsLoadingAudio(false);
      event.target.value = '';
    }
  };

  const handleSpeedChange = (next: number) => {
    anchorLivePlayback();
    speedRef.current = next;
    setPlaybackSpeed(next);
    updateSourceRate();
  };

  const handleBpmChange = (next: number) => {
    setDjBpm(next);
    const channel = channelRef.current;
    const ctx = ctxRef.current;
    if (channel && ctx) {
      channel.sidechainLFO.frequency.setTargetAtTime(next / 60, ctx.currentTime, 0.05);
    }
  };

  const handleFxChange = (key: keyof FxParams, value: number) => {
    if (key === 'pitch') anchorLivePlayback();
    const next = { ...fxRef.current, [key]: value };
    fxRef.current = next;
    setDjFx(next);
    channelRef.current?.applyParams(next);
    updateSourceRate();
  };

  const toggleReversePlayback = () => {
    const wasPlaying = isPlayingRef.current;
    const live = getLivePosition();
    stopCurrentSource();
    clearAnimation();
    const nextReverse = !reverseRef.current;
    reverseRef.current = nextReverse;
    setIsReverse(nextReverse);
    isPlayingRef.current = false;
    setIsDjPlaying(false);
    syncPosition(live);
    if (wasPlaying) {
      requestAnimationFrame(() => startDjPlayback(live, nextReverse));
    }
  };

  const rewindDjAudio = () => {
    seekDjPosition(Math.max(0, getLivePosition() - 5));
  };

  const jumpDjStart = () => {
    seekDjPosition(0);
  };

  const triggerScratchGrain = (position: number, deltaX: number, velocity: number) => {
    const baseBuffer = audioBufferRef.current;
    if (!baseBuffer || Math.abs(deltaX) < 1) return;
    const { ctx, channel } = ensureAudioGraph();
    const reverse = deltaX < 0;
    const buffer = reverse ? getReverseBuffer() : baseBuffer;
    if (!buffer) return;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const grainDuration = 0.11;
    const offset = reverse
      ? Math.max(0, Math.min(baseBuffer.duration - grainDuration, baseBuffer.duration - position))
      : Math.max(0, Math.min(baseBuffer.duration - grainDuration, position));
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.35, Math.min(2.4, 0.75 + Math.abs(velocity) / 360));
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.55, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + grainDuration);
    source.connect(gain);
    gain.connect(channel.input);
    source.start(now, offset, grainDuration);
    source.stop(now + grainDuration + 0.02);
  };

  const beginScratch = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!audioBufferRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const live = getLivePosition();
    const wasPlaying = isPlayingRef.current;
    clearAnimation();
    stopCurrentSource();
    isPlayingRef.current = false;
    setIsDjPlaying(false);
    syncPosition(live);
    scratchEditRef.current = {
      pointerStartX: event.clientX,
      startPosition: live,
      lastX: event.clientX,
      lastAt: performance.now(),
      wasPlaying,
    };
  };

  const moveScratch = (event: React.PointerEvent<HTMLDivElement>) => {
    const edit = scratchEditRef.current;
    const buffer = audioBufferRef.current;
    if (!edit || !buffer) return;
    event.preventDefault();
    const now = performance.now();
    const dx = event.clientX - edit.pointerStartX;
    const next = syncPosition(edit.startPosition + (dx / 520) * buffer.duration);
    const timeDelta = Math.max(1, now - edit.lastAt);
    const moveDelta = event.clientX - edit.lastX;
    if (Math.abs(moveDelta) > 1.5 && timeDelta > 24) {
      triggerScratchGrain(next, moveDelta, (moveDelta / timeDelta) * 1000);
      edit.lastX = event.clientX;
      edit.lastAt = now;
    }
  };

  const endScratch = () => {
    const edit = scratchEditRef.current;
    if (!edit) return;
    scratchEditRef.current = null;
    if (edit.wasPlaying) {
      startDjPlayback(positionRef.current, reverseRef.current);
    }
  };

  useEffect(() => {
    audioBufferRef.current = audioBuffer;
  }, [audioBuffer]);

  useEffect(() => {
    djTracksRef.current = djTracks;
  }, [djTracks]);

  useEffect(() => {
    activeTrackIdRef.current = activeTrackId;
  }, [activeTrackId]);

  useEffect(() => {
    positionRef.current = djPosition;
  }, [djPosition]);

  useEffect(() => {
    isPlayingRef.current = isDjPlaying;
  }, [isDjPlaying]);

  useEffect(() => {
    reverseRef.current = isReverse;
  }, [isReverse]);

  useEffect(() => {
    speedRef.current = playbackSpeed;
    updateSourceRate();
  }, [playbackSpeed]);

  useEffect(() => {
    fxRef.current = djFx;
    channelRef.current?.applyParams(djFx);
    updateSourceRate();
  }, [djFx]);

  useEffect(() => {
    let cancelled = false;

    readPersistedSnapshot<PersistedDJState>(DJ_PERSISTENCE_KEY).then(async (snapshot) => {
      if (cancelled) return;
      if (snapshot) {
        await applyDjPersistedState(snapshot);
      }
      hasHydratedPersistenceRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSyncMessage = async (message: PersistenceSyncMessage) => {
      if (message.key !== DJ_PERSISTENCE_KEY || message.sourceId === persistenceSourceIdRef.current) return;
      if (message.updatedAt <= lastPersistenceUpdateRef.current) return;
      if (message.cleared) {
        await resetDjEditorState(false);
        lastPersistenceUpdateRef.current = message.updatedAt;
        return;
      }

      const snapshot = await readPersistedSnapshot<PersistedDJState>(DJ_PERSISTENCE_KEY);
      if (snapshot && snapshot.updatedAt > lastPersistenceUpdateRef.current) {
        await applyDjPersistedState(snapshot);
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(PERSISTENCE_SYNC_CHANNEL);
      channel.onmessage = (event) => handleSyncMessage(event.data as PersistenceSyncMessage);
    } catch {
      channel = null;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PERSISTENCE_SYNC_STORAGE_KEY || !event.newValue) return;
      try {
        handleSyncMessage(JSON.parse(event.newValue) as PersistenceSyncMessage);
      } catch {
        // Ignore malformed sync messages.
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      channel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    queueDjPersistence();
  }, [djTracks, activeTrackId, djPosition, isReverse, djBpm, playbackSpeed, djFx]);

  useEffect(() => () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    clearAnimation();
    stopCurrentSource();
    ctxRef.current?.close();
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-[#08090b] text-zinc-100">
      <header className="flex h-16 items-center justify-between border-b border-white/10 bg-black/60 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to main page"
            title="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.24em] text-white">DJ Audio Editor</h1>
            <div className="mt-0.5 max-w-[46vw] truncate text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{fileName}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleAudioUpload} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoadingAudio}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500 px-4 text-[10px] font-bold uppercase tracking-widest text-white shadow-[0_0_22px_rgba(16,185,129,0.22)] hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {isLoadingAudio ? 'Loading' : 'Upload Audio'}
          </button>
        </div>
      </header>

      <main className="grid h-[calc(100vh-4rem)] min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.25fr)]">
        <section className="flex min-h-0 flex-col border-r border-white/10 bg-zinc-950/70 p-4 sm:p-6">
          <div
            onPointerDown={beginScratch}
            onPointerMove={moveScratch}
            onPointerUp={endScratch}
            onPointerCancel={endScratch}
            className="mx-auto mt-3 flex aspect-square w-full max-w-[380px] touch-none items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_50%_45%,rgba(16,185,129,0.22),rgba(24,24,27,0.94)_58%,rgba(0,0,0,0.95))] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex aspect-square w-[72%] items-center justify-center rounded-full border border-white/10 bg-black/70 shadow-inner">
              <div
                className={cn(
                  "flex aspect-square w-[62%] items-center justify-center rounded-full border border-emerald-400/40 bg-zinc-950 text-emerald-300",
                  isDjPlaying && "animate-spin"
                )}
                style={{ animationDuration: '1.8s' }}
              >
                <Disc3 className="h-16 w-16" strokeWidth={1.4} />
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.01"
              value={duration ? djPosition : 0}
              onChange={(event) => seekDjPosition(Number(event.target.value))}
              disabled={!audioBuffer}
              aria-label="DJ audio progress"
              className="w-full accent-emerald-400"
            />
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              <span>{formatDjTime(djPosition)}</span>
              <span>{formatDjTime(duration)}</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-5 gap-2">
            <button
              type="button"
              onClick={jumpDjStart}
              disabled={!audioBuffer}
              aria-label="Return DJ audio to start"
              className="flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-30"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={rewindDjAudio}
              disabled={!audioBuffer}
              aria-label="Rewind DJ audio"
              className="flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-30"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => isDjPlaying ? pauseDjPlayback() : startDjPlayback()}
              disabled={!audioBuffer}
              aria-label={isDjPlaying ? 'Pause DJ audio' : 'Play DJ audio'}
              className="flex h-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_22px_rgba(16,185,129,0.28)] hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none"
            >
              {isDjPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
            </button>
            <button
              type="button"
              onClick={toggleReversePlayback}
              disabled={!audioBuffer}
              aria-pressed={isReverse}
              className={cn(
                "flex h-11 items-center justify-center rounded-full border text-[10px] font-bold uppercase tracking-widest disabled:opacity-30",
                isReverse ? "border-fuchsia-400 bg-fuchsia-500 text-white" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              )}
            >
              Rev
            </button>
            <button
              type="button"
              onClick={() => handleSpeedChange(1)}
              disabled={!audioBuffer}
              className="flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:bg-white/10 disabled:opacity-30"
            >
              1x
            </button>
          </div>

          <div className="mt-6 flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-black/25">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3">
              <div>
                <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-300">Track Queue</h2>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">
                  {activeTrack ? activeTrack.fileName : 'Upload audio to build a set'}
                </p>
              </div>
              <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                {djTracks.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 scrollbar-none">
              {djTracks.length === 0 ? (
                <div className="flex h-full min-h-28 items-center justify-center rounded border border-dashed border-white/10 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
                  No tracks loaded
                </div>
              ) : djTracks.map((track, index) => {
                const isActiveTrack = track.id === activeTrackId;
                const isDraggingTrack = track.id === draggingTrackId;
                return (
                  <div
                    key={track.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onClick={() => selectDjTrackForPlayback(track.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectDjTrackForPlayback(track.id);
                      }
                    }}
                    onDragStart={(event) => {
                      setDraggingTrackId(track.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', track.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const draggedId = event.dataTransfer.getData('text/plain') || draggingTrackId;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const placement = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
                      if (draggedId) reorderDjTrack(draggedId, track.id, placement);
                      setDraggingTrackId(null);
                    }}
                    onDragEnd={() => setDraggingTrackId(null)}
                    className={cn(
                      "group flex cursor-grab items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all active:cursor-grabbing",
                      isActiveTrack
                        ? "border-emerald-400/60 bg-emerald-500/12 text-white shadow-[0_0_18px_rgba(16,185,129,0.12)]"
                        : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07] hover:text-white",
                      isDraggingTrack && "opacity-45"
                    )}
                  >
                    <MoveHorizontal className={cn("h-4 w-4 shrink-0", isActiveTrack ? "text-emerald-300" : "text-zinc-600 group-hover:text-zinc-400")} />
                    <span className="w-6 shrink-0 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-black uppercase tracking-[0.18em]">{track.fileName}</div>
                      <div className="mt-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                        <span>{formatDjTime(track.duration)}</span>
                        {!track.audio && <span className="text-amber-300">cache missing</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => removeDjTrack(event, track.id)}
                      aria-label={`Delete ${track.fileName}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-500 opacity-70 transition-colors hover:bg-red-500 hover:text-white group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={3} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#101114,#07080a)] p-4 sm:p-6">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-200">Transport</h2>
                <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  {isReverse ? 'Reverse' : 'Forward'}
                </span>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    <span>BPM</span>
                    <span className="text-zinc-200">{djBpm}</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="200"
                    step="1"
                    value={djBpm}
                    onChange={(event) => handleBpmChange(Number(event.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    <span>Speed</span>
                    <span className="text-zinc-200">{playbackSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.25"
                    max="2"
                    step="0.01"
                    value={playbackSpeed}
                    onChange={(event) => handleSpeedChange(Number(event.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-200">Scratch</h2>
                <MoveHorizontal className="h-4 w-4 text-emerald-300" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => handleSpeedChange(speed)}
                    className={cn(
                      "h-10 rounded border text-[10px] font-bold uppercase tracking-widest transition-colors",
                      Math.abs(playbackSpeed - speed) < 0.01
                        ? "border-emerald-400 bg-emerald-500 text-white"
                        : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-200">FX Rack</h2>
	              <button
	                type="button"
	                onClick={() => resetDjEditorState()}
	                title="Reset DJ page and clear local cache"
	                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white"
	              >
                Reset
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {DJ_FX_CONTROLS.map((control) => (
                <label key={control.key} className="rounded-lg border border-white/5 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                    <span className="truncate">{control.name}</span>
                    <span className="text-zinc-200">{djFx[control.key]}</span>
                  </div>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step ?? 1}
                    value={djFx[control.key]}
                    onChange={(event) => handleFxChange(control.key, Number(event.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
