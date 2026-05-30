import { useEffect, useRef, useState } from 'react';
import { engineManager, type SoundDef } from '../audio';
import {
  DEFAULT_TIMELINE_SECONDS,
  PIXELS_PER_SECOND,
  TIMELINE_SNAP,
  TIMELINE_TRACKS,
  TRACK_ROW_HEIGHT,
  type TimelineClip,
  type TimelinePointerEdit,
  type TimelineTransportEdit,
} from '../app/model';

interface UseTimelineEditorOptions {
  recordedSounds: SoundDef[];
  getSoundById: (id: string) => SoundDef | undefined;
}

export function useTimelineEditor({ recordedSounds, getSoundById }: UseTimelineEditorOptions) {
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [selectedTimelineClipId, setSelectedTimelineClipId] = useState<string | null>(null);
  const [timelineDeleteHistory, setTimelineDeleteHistory] = useState<TimelineClip[][]>([]);
  const [timelinePlayhead, setTimelinePlayhead] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [timelineDuration, setTimelineDuration] = useState(DEFAULT_TIMELINE_SECONDS);
  const [timelineLoopRange, setTimelineLoopRange] = useState({ start: 0, end: 8 });

  const timelineGridRef = useRef<HTMLDivElement>(null);
  const timelineEditRef = useRef<TimelinePointerEdit | null>(null);
  const timelineTransportEditRef = useRef<TimelineTransportEdit | null>(null);
  const timelineSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const timelineAnimationRef = useRef<number | null>(null);
  const timelineStartedAtRef = useRef(0);
  const timelineOffsetRef = useRef(0);
  const timelineLoopRangeRef = useRef(timelineLoopRange);
  const timelinePlayheadRef = useRef(timelinePlayhead);

  useEffect(() => {
    timelineLoopRangeRef.current = timelineLoopRange;
  }, [timelineLoopRange]);

  useEffect(() => {
    timelinePlayheadRef.current = timelinePlayhead;
  }, [timelinePlayhead]);

  useEffect(() => {
    const minRange = 0.25;
    setTimelineLoopRange(prev => {
      const end = Math.max(minRange, Math.min(prev.end, timelineDuration));
      const start = Math.max(0, Math.min(prev.start, end - minRange));
      if (start === prev.start && end === prev.end) return prev;
      return { start, end };
    });
    setTimelinePlayhead(prev => Math.max(0, Math.min(prev, timelineDuration)));
    setTimelineClips(prev => prev.map(clip => {
      const duration = Math.max(0.5, Math.min(clip.duration, timelineDuration));
      const start = Math.max(0, Math.min(clip.start, Math.max(0, timelineDuration - duration)));
      if (start === clip.start && duration === clip.duration) return clip;
      return { ...clip, start, duration };
    }));
  }, [timelineDuration]);

  const snapTime = (value: number, candidates: number[] = []) => {
    const clamped = Math.max(0, Math.min(timelineDuration, value));
    const grid = Math.round(clamped / TIMELINE_SNAP) * TIMELINE_SNAP;
    const closeCandidate = candidates.find(candidate => Math.abs(candidate - clamped) <= 0.12);
    return Math.max(0, Math.min(timelineDuration, closeCandidate ?? grid));
  };

  const timelineSnapCandidates = (excludeClipId?: string) => timelineClips
    .filter(clip => clip.id !== excludeClipId)
    .flatMap(clip => [clip.start, clip.start + clip.duration]);

  const seekTimelinePlayhead = (value: number) => {
    const next = snapTime(value, [
      timelineLoopRangeRef.current.start,
      timelineLoopRangeRef.current.end,
      ...timelineSnapCandidates(),
    ]);
    timelineOffsetRef.current = next;
    timelinePlayheadRef.current = next;
    setTimelinePlayhead(next);
  };

  const timeFromTimelinePointer = (clientX: number) => {
    const rect = timelineGridRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return (clientX - rect.left - 80) / PIXELS_PER_SECOND;
  };

  const handleTimelineDrop = (event: React.DragEvent, track: number) => {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const start = snapTime((event.clientX - rect.left) / PIXELS_PER_SECOND, timelineSnapCandidates());

    try {
      const data = event.dataTransfer.getData('application/json');
      const itemData = JSON.parse(data) as SoundDef;
      const item = getSoundById(itemData.id);
      if (!item) return;
      const duration = Math.min(timelineDuration, 8, Math.max(1.5, item.buffer?.duration ?? 4));
      setTimelineClips(prev => [
        ...prev,
        {
          id: `clip-${Date.now()}`,
          soundId: item.id,
          track,
          start: Math.max(0, Math.min(timelineDuration - duration, start)),
          duration,
          trimStart: 0,
        },
      ]);
    } catch (err) {
      console.error('Timeline drop error', err);
    }
  };

  const duplicateTimelineClip = (clipId: string) => {
    const clip = timelineClips.find(item => item.id === clipId);
    if (!clip) return;
    setTimelineClips(prev => [
      ...prev,
      {
        ...clip,
        id: `clip-${Date.now()}`,
        start: Math.max(0, Math.min(timelineDuration - clip.duration, clip.start + 0.75)),
        track: Math.min(TIMELINE_TRACKS - 1, clip.track + 1),
      },
    ]);
  };

  const cropTimelineClip = (clipId: string, edge: 'left' | 'right', amount: number) => {
    setTimelineClips(prev => prev.map(clip => {
      if (clip.id !== clipId) return clip;
      if (edge === 'left') {
        const nextDuration = Math.max(0.5, clip.duration - amount);
        return {
          ...clip,
          start: Math.min(clip.start + amount, clip.start + clip.duration - 0.5),
          duration: nextDuration,
          trimStart: Math.max(0, clip.trimStart + amount),
        };
      }
      return { ...clip, duration: Math.max(0.5, clip.duration + amount) };
    }));
  };

  const clearTimelinePlayback = () => {
    timelineSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    });
    timelineSourcesRef.current = [];
    if (timelineAnimationRef.current !== null) {
      cancelAnimationFrame(timelineAnimationRef.current);
      timelineAnimationRef.current = null;
    }
  };

  const stopTimelinePlayback = (resetHead = false) => {
    clearTimelinePlayback();
    setIsTimelinePlaying(false);
    if (resetHead) {
      const start = timelineLoopRangeRef.current.start;
      timelineOffsetRef.current = start;
      timelinePlayheadRef.current = start;
      setTimelinePlayhead(start);
    }
  };

  const deleteSelectedTimelineClip = () => {
    if (!selectedTimelineClipId) return;
    const clip = timelineClips.find(item => item.id === selectedTimelineClipId);
    if (!clip) return;
    if (isTimelinePlaying) stopTimelinePlayback(false);
    setTimelineDeleteHistory(prev => [...prev.slice(-19), [clip]]);
    setTimelineClips(prev => prev.filter(item => item.id !== selectedTimelineClipId));
    setSelectedTimelineClipId(null);
  };

  const undoTimelineDelete = () => {
    const restored = timelineDeleteHistory[timelineDeleteHistory.length - 1];
    if (!restored?.length) return;
    setTimelineClips(current => {
      const currentIds = new Set(current.map(clip => clip.id));
      return [...current, ...restored.filter(clip => !currentIds.has(clip.id))]
        .sort((a, b) => a.track - b.track || a.start - b.start);
    });
    setSelectedTimelineClipId(restored[0]?.id ?? null);
    setTimelineDeleteHistory(prev => prev.slice(0, -1));
  };

  const beginTimelineEdit = (event: React.PointerEvent, clip: TimelineClip, mode: TimelinePointerEdit['mode']) => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedTimelineClipId(clip.id);
    timelineEditRef.current = {
      clipId: clip.id,
      mode,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      clipStart: clip.start,
      clipDuration: clip.duration,
      clipTrimStart: clip.trimStart,
      clipTrack: clip.track,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const beginTimelineTransportEdit = (event: React.PointerEvent, mode: TimelineTransportEdit['mode']) => {
    event.stopPropagation();
    event.preventDefault();
    if (mode === 'playhead' && isTimelinePlaying) {
      stopTimelinePlayback(false);
    }
    timelineTransportEditRef.current = {
      mode,
      pointerStartX: event.clientX,
      rangeStart: timelineLoopRangeRef.current.start,
      rangeEnd: timelineLoopRangeRef.current.end,
      playhead: timelinePlayheadRef.current,
      wasPlaying: isTimelinePlaying,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const playTimeline = () => {
    clearTimelinePlayback();
    engineManager.init();
    const ctx = engineManager.ctx;
    if (!ctx) return;
    const range = timelineLoopRangeRef.current;
    const loopStart = Math.min(range.start, range.end - 0.25);
    const loopEnd = Math.max(loopStart + 0.25, range.end);
    const currentHead = timelinePlayheadRef.current;
    const offset = currentHead >= loopStart && currentHead < loopEnd ? currentHead : loopStart;
    timelineStartedAtRef.current = ctx.currentTime + 0.08 - offset;
    timelineOffsetRef.current = offset;
    timelinePlayheadRef.current = offset;
    setTimelinePlayhead(offset);
    setIsTimelinePlaying(true);

    const scheduleSegment = (segmentOffset: number) => {
      clearTimelinePlayback();
      timelineStartedAtRef.current = ctx.currentTime + 0.04 - segmentOffset;
      timelineClips.forEach(clip => {
        const sound = getSoundById(clip.soundId);
        if (!sound?.buffer) return;
        const clipEnd = clip.start + clip.duration;
        const audibleStart = Math.max(clip.start, segmentOffset);
        const audibleEnd = Math.min(clipEnd, loopEnd);
        if (audibleEnd <= audibleStart) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const sourceOffset = clip.trimStart + audibleStart - clip.start;
        const duration = Math.min(audibleEnd - audibleStart, sound.buffer.duration - sourceOffset);
        if (duration <= 0) return;
        source.buffer = sound.buffer;
        gain.gain.value = 0.82;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(ctx.currentTime + 0.04 + audibleStart - segmentOffset, sourceOffset, duration);
        timelineSourcesRef.current.push(source);
      });
    };

    const animate = () => {
      if (!engineManager.ctx) return;
      const next = engineManager.ctx.currentTime - timelineStartedAtRef.current;
      if (next >= loopEnd) {
        timelineOffsetRef.current = loopStart;
        timelinePlayheadRef.current = loopStart;
        setTimelinePlayhead(loopStart);
        scheduleSegment(loopStart);
        timelineAnimationRef.current = requestAnimationFrame(animate);
        return;
      }
      timelinePlayheadRef.current = next;
      setTimelinePlayhead(next);
      timelineAnimationRef.current = requestAnimationFrame(animate);
    };

    scheduleSegment(offset);
    timelineAnimationRef.current = requestAnimationFrame(animate);
  };

  const handleTimelineSurfacePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const wasPlaying = isTimelinePlaying;
    if (wasPlaying) stopTimelinePlayback(false);
    seekTimelinePlayhead(timeFromTimelinePointer(event.clientX));
    if (wasPlaying) requestAnimationFrame(playTimeline);
  };

  const pauseTimeline = () => {
    timelineOffsetRef.current = timelinePlayheadRef.current;
    stopTimelinePlayback(false);
  };

  const rewindTimeline = () => {
    stopTimelinePlayback(true);
  };

  const jumpTimelineToEnd = () => {
    stopTimelinePlayback(false);
    timelineOffsetRef.current = timelineDuration;
    timelinePlayheadRef.current = timelineDuration;
    setTimelinePlayhead(timelineDuration);
  };

  const handleTimelineDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    if (isTimelinePlaying) stopTimelinePlayback(false);
    setTimelineDuration(Math.max(1, Math.min(600, next)));
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const transportEdit = timelineTransportEditRef.current;
      if (transportEdit) {
        const dx = (event.clientX - transportEdit.pointerStartX) / PIXELS_PER_SECOND;

        if (transportEdit.mode === 'playhead') {
          seekTimelinePlayhead(transportEdit.playhead + dx);
          return;
        }

        if (transportEdit.mode === 'range-start') {
          const nextStart = Math.min(
            transportEdit.rangeEnd - 0.25,
            snapTime(transportEdit.rangeStart + dx, timelineSnapCandidates()),
          );
          setTimelineLoopRange(prev => ({
            ...prev,
            start: Math.max(0, nextStart),
          }));
          return;
        }

        if (transportEdit.mode === 'range-end') {
          const nextEnd = Math.max(
            transportEdit.rangeStart + 0.25,
            snapTime(transportEdit.rangeEnd + dx, timelineSnapCandidates()),
          );
          setTimelineLoopRange(prev => ({
            ...prev,
            end: Math.min(timelineDuration, nextEnd),
          }));
          return;
        }

        const duration = transportEdit.rangeEnd - transportEdit.rangeStart;
        const nextStart = Math.max(0, Math.min(timelineDuration - duration, snapTime(transportEdit.rangeStart + dx, timelineSnapCandidates())));
        setTimelineLoopRange({
          start: nextStart,
          end: nextStart + duration,
        });
        return;
      }

      const edit = timelineEditRef.current;
      if (!edit) return;
      const dx = (event.clientX - edit.pointerStartX) / PIXELS_PER_SECOND;
      const candidates = timelineSnapCandidates(edit.clipId);

      setTimelineClips(prev => prev.map(clip => {
        if (clip.id !== edit.clipId) return clip;

        if (edit.mode === 'move') {
          const rect = timelineGridRef.current?.getBoundingClientRect();
          const track = rect
            ? Math.max(0, Math.min(TIMELINE_TRACKS - 1, Math.floor((event.clientY - rect.top) / TRACK_ROW_HEIGHT)))
            : edit.clipTrack;
          const snappedStart = snapTime(edit.clipStart + dx, candidates);
          return {
            ...clip,
            start: Math.max(0, Math.min(timelineDuration - clip.duration, snappedStart)),
            track,
          };
        }

        if (edit.mode === 'trim-start') {
          const rawStart = edit.clipStart + dx;
          const maxStart = edit.clipStart + edit.clipDuration - 0.5;
          const snappedStart = Math.max(0, Math.min(maxStart, snapTime(rawStart, candidates)));
          const consumed = snappedStart - edit.clipStart;
          return {
            ...clip,
            start: snappedStart,
            duration: Math.max(0.5, edit.clipDuration - consumed),
            trimStart: Math.max(0, edit.clipTrimStart + consumed),
          };
        }

        const rawEnd = edit.clipStart + edit.clipDuration + dx;
        const maxEnd = Math.min(timelineDuration, edit.clipStart + (getSoundById(clip.soundId)?.buffer?.duration ?? timelineDuration) - edit.clipTrimStart);
        const snappedEnd = Math.max(edit.clipStart + 0.5, Math.min(maxEnd, snapTime(rawEnd, candidates)));
        return {
          ...clip,
          duration: Math.max(0.5, snappedEnd - edit.clipStart),
        };
      }));
    };

    const handlePointerUp = () => {
      const transportEdit = timelineTransportEditRef.current;
      timelineEditRef.current = null;
      timelineTransportEditRef.current = null;
      if (transportEdit?.mode === 'playhead' && transportEdit.wasPlaying) {
        requestAnimationFrame(playTimeline);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [timelineClips, recordedSounds, timelineDuration, isTimelinePlaying]);

  return {
    timelineClips,
    setTimelineClips,
    selectedTimelineClipId,
    setSelectedTimelineClipId,
    timelineDeleteHistory,
    setTimelineDeleteHistory,
    timelinePlayhead,
    setTimelinePlayhead,
    isTimelinePlaying,
    setIsTimelinePlaying,
    timelineDuration,
    setTimelineDuration,
    timelineLoopRange,
    setTimelineLoopRange,
    timelineGridRef,
    timelineOffsetRef,
    timelinePlayheadRef,
    stopTimelinePlayback,
    handleTimelineDrop,
    duplicateTimelineClip,
    cropTimelineClip,
    deleteSelectedTimelineClip,
    undoTimelineDelete,
    beginTimelineEdit,
    beginTimelineTransportEdit,
    handleTimelineSurfacePointerDown,
    pauseTimeline,
    playTimeline,
    rewindTimeline,
    jumpTimelineToEnd,
    handleTimelineDurationChange,
  };
}
