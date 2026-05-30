import React from 'react';
import { Copy, MoveHorizontal, Pause, Play, RotateCcw, Scissors, SkipBack, SkipForward, Trash2, X } from 'lucide-react';
import type { SoundDef } from '../audio';
import { cn } from '../lib/utils';
import {
  CLIP_COLOR_CLASSES,
  PIXELS_PER_SECOND,
  TIMELINE_TRACKS,
  type TimelineClip,
  type TimelinePointerEdit,
  type TimelineTransportEdit,
} from '../app/model';

interface TimelinePageProps {
  isDayMode: boolean;
  mutedTextClass: string;
  softButtonClass: string;
  recordedSounds: SoundDef[];
  timelineDuration: number;
  timelineGridRef: React.RefObject<HTMLDivElement | null>;
  timelineLoopRange: { start: number; end: number };
  timelinePlayhead: number;
  timelineClips: TimelineClip[];
  selectedTimelineClipId: string | null;
  timelineDeleteHistory: TimelineClip[][];
  isTimelinePlaying: boolean;
  clearRecordedSounds: () => void;
  deleteRecordedSound: (soundId: string) => void;
  handleDragStart: (event: React.DragEvent, item: SoundDef) => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleTimelineDurationChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  rewindTimeline: () => void;
  pauseTimeline: () => void;
  playTimeline: () => void;
  jumpTimelineToEnd: () => void;
  beginTimelineTransportEdit: (event: React.PointerEvent, mode: TimelineTransportEdit['mode']) => void;
  handleTimelineDrop: (event: React.DragEvent, track: number) => void;
  handleTimelineSurfacePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  getSoundById: (id: string) => SoundDef | undefined;
  beginTimelineEdit: (event: React.PointerEvent, clip: TimelineClip, mode: TimelinePointerEdit['mode']) => void;
  selectTimelineClip: (clipId: string) => void;
  duplicateTimelineClip: (clipId: string) => void;
  cropTimelineClip: (clipId: string, edge: 'left' | 'right', amount: number) => void;
  deleteSelectedTimelineClip: () => void;
  undoTimelineDelete: () => void;
}

export function TimelinePage({
  isDayMode,
  mutedTextClass,
  softButtonClass,
  recordedSounds,
  timelineDuration,
  timelineGridRef,
  timelineLoopRange,
  timelinePlayhead,
  timelineClips,
  selectedTimelineClipId,
  timelineDeleteHistory,
  isTimelinePlaying,
  clearRecordedSounds,
  deleteRecordedSound,
  handleDragStart,
  handleDragOver,
  handleTimelineDurationChange,
  rewindTimeline,
  pauseTimeline,
  playTimeline,
  jumpTimelineToEnd,
  beginTimelineTransportEdit,
  handleTimelineDrop,
  handleTimelineSurfacePointerDown,
  getSoundById,
  beginTimelineEdit,
  selectTimelineClip,
  duplicateTimelineClip,
  cropTimelineClip,
  deleteSelectedTimelineClip,
  undoTimelineDelete,
}: TimelinePageProps) {
  return (
    <main className="min-h-0 flex-1 grid grid-cols-[260px_minmax(0,1fr)] gap-0 overflow-hidden">
      <aside className={cn("border-r p-4 flex flex-col gap-4 overflow-hidden", isDayMode ? "border-slate-900/10 bg-white/75" : "border-white/5 bg-black/35")}>
        <div className="flex items-center justify-between">
          <h2 className={cn("text-[10px] font-bold uppercase tracking-[0.22em]", mutedTextClass)}>素材库</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearRecordedSounds}
              disabled={recordedSounds.length === 0}
              aria-label="Clear all recorded materials"
              title="清空全部素材"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
                recordedSounds.length === 0
                  ? isDayMode ? "border-slate-900/5 bg-slate-900/5 text-slate-300 cursor-not-allowed" : "border-white/5 bg-white/5 text-zinc-700 cursor-not-allowed"
                  : isDayMode ? "border-slate-900/10 bg-slate-900/5 text-slate-500 hover:bg-red-50 hover:text-red-600" : "border-white/5 bg-white/5 text-zinc-500 hover:bg-red-500/15 hover:text-red-300"
              )}
            >
              <Trash2 size={13} strokeWidth={2.4} />
            </button>
            <span className={cn("rounded px-2 py-1 text-[9px] font-bold", isDayMode ? "bg-slate-900/5 text-slate-500" : "bg-white/5 text-zinc-500")}>{recordedSounds.length}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 scrollbar-none">
          {recordedSounds.length === 0 && (
            <div className={cn("rounded-xl border border-dashed p-4 text-[11px] leading-relaxed", isDayMode ? "border-slate-900/15 text-slate-400" : "border-white/10 text-zinc-600")}>
              点击顶部录制按钮，播放几个标签片段，再停止录制。生成的音乐片段会自动出现在这里。
            </div>
          )}
          {recordedSounds.map((sound, index) => (
            <div
              key={sound.id}
              draggable
              onDragStart={(event) => handleDragStart(event, sound)}
              className={cn("relative rounded-lg border p-3 cursor-grab active:cursor-grabbing", isDayMode ? "bg-white border-slate-900/10 shadow-sm" : "bg-zinc-900/80 border-white/10")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={cn("truncate text-[11px] font-bold uppercase tracking-widest", isDayMode ? "text-slate-800" : "text-zinc-100")}>{sound.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", sound.color || CLIP_COLOR_CLASSES[index % CLIP_COLOR_CLASSES.length])}></span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteRecordedSound(sound.id);
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    aria-label={`Delete ${sound.name}`}
                    title="删除素材"
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                      isDayMode ? "text-slate-400 hover:bg-slate-900/10 hover:text-red-600" : "text-zinc-500 hover:bg-white/10 hover:text-red-300"
                    )}
                  >
                    <X size={13} strokeWidth={2.8} />
                  </button>
                </div>
              </div>
              <div className="flex h-8 items-end gap-1">
                {[0.32, 0.68, 0.46, 0.88, 0.58, 0.76, 0.38, 0.66].map((height, index) => (
                  <span key={index} className={cn("flex-1 rounded-t", sound.color || "bg-emerald-500")} style={{ height: `${height * 100}%`, opacity: 0.35 + index * 0.04 }} />
                ))}
              </div>
              <div className={cn("mt-2 text-[9px] uppercase tracking-widest", mutedTextClass)}>
                {sound.buffer ? `${sound.buffer.duration.toFixed(1)}s audio` : 'Pattern loop'}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className={cn("min-w-0 flex flex-col overflow-hidden", isDayMode ? "bg-slate-100" : "bg-[#09090b]")}>
        <div className={cn("flex h-16 shrink-0 items-center justify-between border-b px-5", isDayMode ? "border-slate-900/10 bg-white/60" : "border-white/5 bg-zinc-950/80")}>
          <div className="flex items-center gap-3">
            <h1 className={cn("text-sm font-black uppercase tracking-[0.25em]", isDayMode ? "text-slate-900" : "text-white")}>Timeline</h1>
            <span className={cn("text-[10px] uppercase tracking-widest", mutedTextClass)}>Drag, move, crop, copy, arrange</span>
          </div>
          <div className="flex items-center gap-2">
            <label className={cn("flex h-10 items-center gap-2 rounded-full border px-3 text-[10px] font-bold uppercase tracking-widest", softButtonClass)}>
              <span className={mutedTextClass}>Length</span>
              <input
                type="number"
                min="1"
                max="600"
                step="1"
                value={timelineDuration}
                onChange={handleTimelineDurationChange}
                className={cn("w-14 bg-transparent text-right font-mono outline-none", isDayMode ? "text-slate-950" : "text-white")}
                aria-label="Timeline total duration in seconds"
              />
              <span className={mutedTextClass}>s</span>
            </label>
            <button onClick={rewindTimeline} className={cn("flex h-10 w-10 items-center justify-center rounded-full border transition-colors", softButtonClass)} aria-label="Return playhead to start" title="Return playhead to start">
              <SkipBack size={15} fill="currentColor" />
            </button>
            <button
              onClick={isTimelinePlaying ? pauseTimeline : playTimeline}
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_0_24px_rgba(16,185,129,0.22)] transition-colors",
                isTimelinePlaying ? "bg-zinc-900 border border-emerald-400/30" : "bg-emerald-500"
              )}
              aria-label={isTimelinePlaying ? "Pause timeline" : "Play timeline"}
              title={isTimelinePlaying ? "Pause timeline" : "Play timeline"}
            >
              {isTimelinePlaying && <span className="absolute -inset-1 rounded-full border border-emerald-400/25 border-t-emerald-100 animate-spin" />}
              {isTimelinePlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            </button>
            <button onClick={jumpTimelineToEnd} className={cn("flex h-10 w-10 items-center justify-center rounded-full border transition-colors", softButtonClass)} aria-label="Jump playhead to end" title="Jump playhead to end">
              <SkipForward size={15} fill="currentColor" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="relative p-5" style={{ minWidth: 80 + timelineDuration * PIXELS_PER_SECOND + 40 }}>
            <div className="ml-20 flex h-8 border-b border-white/10">
              {Array.from({ length: Math.floor(timelineDuration) + 1 }).map((_, second) => (
                <div key={second} className={cn("relative h-8 border-l text-[9px]", isDayMode ? "border-slate-900/10 text-slate-400" : "border-white/10 text-zinc-600")} style={{ width: PIXELS_PER_SECOND }}>
                  <span className="absolute left-1 top-1">{second}s</span>
                </div>
              ))}
            </div>

            <div ref={timelineGridRef} className="relative space-y-2">
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 border-x border-emerald-300/60 bg-emerald-400/10"
                style={{ left: 80 + timelineLoopRange.start * PIXELS_PER_SECOND, width: Math.max(12, (timelineLoopRange.end - timelineLoopRange.start) * PIXELS_PER_SECOND) }}
              />
              <div
                className="absolute -top-8 z-40 h-8 rounded-t-lg border border-emerald-300/70 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.22)]"
                style={{ left: 80 + timelineLoopRange.start * PIXELS_PER_SECOND, width: Math.max(28, (timelineLoopRange.end - timelineLoopRange.start) * PIXELS_PER_SECOND) }}
              >
                <button type="button" onPointerDown={(event) => beginTimelineTransportEdit(event, 'range-start')} className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-tl-lg bg-emerald-200/70 hover:bg-white" aria-label="Adjust loop range start" />
                <button type="button" onPointerDown={(event) => beginTimelineTransportEdit(event, 'range-move')} className="absolute inset-x-3 top-0 h-full cursor-grab active:cursor-grabbing" aria-label="Move loop range">
                  <span className="flex h-full items-center justify-center text-[9px] font-black uppercase tracking-widest text-emerald-50">
                    {timelineLoopRange.start.toFixed(1)} - {timelineLoopRange.end.toFixed(1)}
                  </span>
                </button>
                <button type="button" onPointerDown={(event) => beginTimelineTransportEdit(event, 'range-end')} className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-tr-lg bg-emerald-200/70 hover:bg-white" aria-label="Adjust loop range end" />
              </div>
              <div
                onPointerDown={(event) => beginTimelineTransportEdit(event, 'playhead')}
                className="absolute -top-8 bottom-0 z-50 w-5 -translate-x-1/2 cursor-ew-resize touch-none"
                style={{ left: 80 + timelinePlayhead * PIXELS_PER_SECOND }}
                aria-label="Drag playhead"
              >
                <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-[0_0_16px_rgba(16,185,129,0.5)]">
                  {timelinePlayhead.toFixed(1)}
                </span>
                <span className="absolute bottom-0 left-1/2 top-5 w-px -translate-x-1/2 bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.65)]" />
              </div>
              {Array.from({ length: TIMELINE_TRACKS }).map((_, track) => (
                <div key={track} className="grid grid-cols-[80px_minmax(0,1fr)]">
                  <div className={cn("flex h-24 items-center border-r pr-3 text-right text-[10px] font-bold uppercase tracking-widest", isDayMode ? "border-slate-900/10 text-slate-500" : "border-white/10 text-zinc-500")}>
                    Track {track + 1}
                  </div>
                  <div
                    onDrop={(event) => handleTimelineDrop(event, track)}
                    onDragOver={handleDragOver}
                    onPointerDown={handleTimelineSurfacePointerDown}
                    className={cn("relative h-24 overflow-hidden border-b", isDayMode ? "border-slate-900/10 bg-white/45" : "border-white/5 bg-white/[0.025]")}
                    style={{
                      backgroundImage: isDayMode
                        ? `linear-gradient(90deg, rgba(15,23,42,0.08) 1px, transparent 1px)`
                        : `linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)`,
                      backgroundSize: `${PIXELS_PER_SECOND}px 100%`,
                    }}
                  >
                    {timelineClips.filter(clip => clip.track === track).map((clip) => {
                      const sound = getSoundById(clip.soundId);
                      const selected = selectedTimelineClipId === clip.id;
                      return (
                        <div
                          key={clip.id}
                          draggable={false}
                          onPointerDown={(event) => beginTimelineEdit(event, clip, 'move')}
                          onClick={() => selectTimelineClip(clip.id)}
                          className={cn(
                            "absolute top-3 h-[68px] rounded-md border p-2 shadow-lg cursor-move overflow-hidden touch-none",
                            selected ? "border-white/80 ring-2 ring-emerald-400/60" : "border-white/20",
                            sound?.color || "bg-emerald-500"
                          )}
                          style={{ left: clip.start * PIXELS_PER_SECOND, width: Math.max(46, clip.duration * PIXELS_PER_SECOND) }}
                        >
                          <button type="button" onPointerDown={(event) => beginTimelineEdit(event, clip, 'trim-start')} className="absolute left-0 top-0 z-20 h-full w-3 cursor-ew-resize bg-white/20 hover:bg-white/45" aria-label="Trim clip start" />
                          <button type="button" onPointerDown={(event) => beginTimelineEdit(event, clip, 'trim-end')} className="absolute right-0 top-0 z-20 h-full w-3 cursor-ew-resize bg-white/20 hover:bg-white/45" aria-label="Trim clip end" />
                          <div className="flex items-center justify-between gap-2 text-white">
                            <span className="truncate text-[10px] font-black uppercase tracking-widest">{sound?.name ?? 'Clip'}</span>
                            <MoveHorizontal size={12} />
                          </div>
                          <div className="mt-2 flex h-4 items-end gap-0.5 opacity-65">
                            {[0.3, 0.72, 0.44, 0.86, 0.52, 0.68, 0.35, 0.8, 0.48, 0.64].map((height, index) => (
                              <span key={index} className="flex-1 rounded-t bg-white" style={{ height: `${height * 100}%` }} />
                            ))}
                          </div>
                          <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-white/75">
                            <span>{clip.duration.toFixed(1)}s</span>
                            <span>trim {clip.trimStart.toFixed(1)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={cn("flex h-16 shrink-0 items-center gap-3 border-t px-5", isDayMode ? "border-slate-900/10 bg-white/75" : "border-white/5 bg-zinc-950/90")}>
          <button onClick={() => selectedTimelineClipId && duplicateTimelineClip(selectedTimelineClipId)} disabled={!selectedTimelineClipId} className={cn("flex h-9 items-center gap-2 rounded border px-3 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35", softButtonClass)}>
            <Copy size={12} />
            Copy
          </button>
          <button onClick={() => selectedTimelineClipId && cropTimelineClip(selectedTimelineClipId, 'left', 0.25)} disabled={!selectedTimelineClipId} className={cn("flex h-9 items-center gap-2 rounded border px-3 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35", softButtonClass)}>
            <Scissors size={12} />
            Trim In
          </button>
          <button onClick={() => selectedTimelineClipId && cropTimelineClip(selectedTimelineClipId, 'right', -0.25)} disabled={!selectedTimelineClipId} className={cn("flex h-9 items-center gap-2 rounded border px-3 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35", softButtonClass)}>
            <Scissors size={12} />
            Trim Out
          </button>
          <button onClick={deleteSelectedTimelineClip} disabled={!selectedTimelineClipId} className="flex h-9 items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 text-[10px] font-bold uppercase tracking-widest text-red-300 disabled:opacity-35">
            <Trash2 size={12} />
            Delete
          </button>
          <button onClick={undoTimelineDelete} disabled={timelineDeleteHistory.length === 0} className={cn("flex h-9 items-center gap-2 rounded border px-3 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35", softButtonClass)}>
            <RotateCcw size={12} />
            Undo Delete
          </button>
        </div>
      </section>
    </main>
  );
}
