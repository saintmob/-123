import React from 'react';
import { Mic, MicOff, Plus, Upload, X } from 'lucide-react';
import { AVAILABLE_SOUNDS, type SoundDef } from '../audio';
import { cn } from '../lib/utils';

const SAMPLE_CATEGORIES = [
  { id: 'beat', name: 'Beats' },
  { id: 'effect', name: 'Effects' },
  { id: 'melody', name: 'Melodies' },
  { id: 'bass', name: 'Basses' },
  { id: 'experimental', name: 'Experimental' },
  { id: 'theme', name: '旋律组' },
];

const EXTRA_CATEGORIES: { id: string; name: string }[] = [];
const CUSTOM_CATEGORY = { id: 'custom', name: 'Custom / Recorded' };

interface SampleLibraryProps {
  isDayMode: boolean;
  hairlineClass: string;
  mutedTextClass: string;
  bpm: number;
  isRecording: boolean;
  recordedSounds: SoundDef[];
  isExtraLibraryOpen: boolean;
  openExtraCategories: Record<string, boolean>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadClick: () => void;
  onToggleRecording: () => void;
  onDragStart: (event: React.DragEvent, item: SoundDef) => void;
  onToggleLoopMode: (event: React.MouseEvent, soundId: string) => void;
  onExtraLibraryOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenExtraCategoriesChange: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export function SampleLibrary({
  isDayMode,
  hairlineClass,
  mutedTextClass,
  bpm,
  isRecording,
  recordedSounds,
  isExtraLibraryOpen,
  openExtraCategories,
  fileInputRef,
  onFileUpload,
  onUploadClick,
  onToggleRecording,
  onDragStart,
  onToggleLoopMode,
  onExtraLibraryOpenChange,
  onOpenExtraCategoriesChange,
}: SampleLibraryProps) {
  const renderLibraryCategory = (category: { id: string; name: string }) => {
    const staticItems = AVAILABLE_SOUNDS.filter(sound => sound.category === category.id);
    const customItems = category.id === 'custom' ? recordedSounds : [];
    const items = [...staticItems, ...customItems];

    if (items.length === 0 && category.id !== 'custom') return null;

    return (
      <div key={category.id} className="flex flex-col gap-1.5">
        <h3 className={cn("text-[9px] font-bold uppercase tracking-widest pl-1", mutedTextClass)}>{category.name}</h3>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {items.length === 0 && category.id === 'custom' && (
            <div className={cn("text-[9px] italic pl-1 py-2", isDayMode ? "text-slate-400" : "text-zinc-700")}>No recordings yet. Hit 'Rec New' upward!</div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => onDragStart(event, item)}
              className={cn(
                "flex-none w-32 rounded-lg border p-3 flex flex-col justify-between cursor-grab active:cursor-grabbing group transition-colors relative origin-center",
                isDayMode ? "bg-white/70 border-slate-900/10 hover:border-slate-400 text-slate-700" : "bg-zinc-900/50 border-white/5 hover:border-zinc-600 text-zinc-300"
              )}
            >
              {category.id === 'custom' && (
                <button
                  onClick={(event) => onToggleLoopMode(event, item.id)}
                  className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-zinc-600 hover:bg-zinc-500 rounded text-[7px] font-bold text-white shadow-md z-10 uppercase transition-colors"
                >
                  {item.loopMode === 'fast' ? 'FAST' : 'FULL'}
                </button>
              )}
              <div className={cn("absolute top-2 right-2 w-2 h-2 rounded-full", item.color)}></div>
              <div className="font-bold text-[11px] uppercase tracking-wider truncate pr-2">{item.name}</div>
              <div className="space-y-1.5 mt-auto">
                <div className="h-4 w-full flex items-end gap-0.5">
                  {[1, 3, 2, 5, 4, 6].map((height, index) => (
                    <div key={index} className={cn("w-1 flex-1 rounded-t-sm opacity-40 group-hover:opacity-60", item.color)} style={{ height: `${height * 15}%` }}></div>
                  ))}
                </div>
                <div className={cn("text-[8px] uppercase tracking-tighter truncate", isDayMode ? "text-slate-400" : "text-zinc-600")}>
                  {category.id === 'custom' ? 'RECORDED' : category.id === 'beat' ? `LOOP / ${bpm}` : 'SYNTH'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className={cn(
      "relative z-20 h-52 flex flex-col gap-2 shrink-0 rounded-2xl border p-3",
      isDayMode ? "border-slate-900/10 bg-white/85 shadow-[0_-18px_40px_rgba(148,163,184,0.25)]" : "border-white/5 bg-[#0d0d10] shadow-[0_-18px_40px_rgba(0,0,0,0.35)]"
    )}>
      <div className="flex items-center gap-2">
        <h2 className={cn("text-[9px] font-bold uppercase tracking-[0.2em]", isDayMode ? "text-slate-500" : "text-zinc-600")}>Sample Library</h2>
        <div className={cn("flex-1 h-px", hairlineClass)}></div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            ref={fileInputRef}
            onChange={onFileUpload}
          />
          <button
            onClick={onUploadClick}
            className={cn("flex items-center gap-1.5 px-3 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-all", isDayMode ? "bg-slate-900/5 text-slate-500 hover:bg-slate-900/10" : "bg-white/5 text-zinc-400 hover:bg-white/10")}
          >
            <Upload size={10} />
            Upload
          </button>
          <button
            onClick={onToggleRecording}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-all",
              isRecording ? "bg-red-500 text-white animate-pulse" : isDayMode ? "bg-slate-900/5 text-slate-500 hover:bg-slate-900/10" : "bg-white/5 text-zinc-400 hover:bg-white/10"
            )}
          >
            {isRecording ? <MicOff size={10} /> : <Mic size={10} />}
            {isRecording ? 'Stop Voice' : 'Voice Rec'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-none pb-4">
        {SAMPLE_CATEGORIES.map(renderLibraryCategory)}
        {EXTRA_CATEGORIES.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onExtraLibraryOpenChange(prev => !prev)}
              className={cn(
                "h-9 flex items-center justify-between rounded-lg border px-3 text-[9px] font-bold uppercase tracking-[0.18em] transition-colors",
                isDayMode ? "border-slate-900/10 bg-slate-900/5 text-slate-500 hover:bg-slate-900/10 hover:text-slate-800" : "border-white/5 bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
              )}
              aria-expanded={isExtraLibraryOpen}
            >
              <span>Extra Library</span>
              <span className={cn("flex items-center gap-2", isExtraLibraryOpen ? isDayMode ? "text-slate-800" : "text-zinc-200" : "")}>
                Rare Shuffle 8%
                {isExtraLibraryOpen ? <X size={12} /> : <Plus size={12} />}
              </span>
            </button>
            {isExtraLibraryOpen && EXTRA_CATEGORIES.map((category) => (
              <div key={category.id} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onOpenExtraCategoriesChange(prev => ({ ...prev, [category.id]: !prev[category.id] }))}
                  className={cn(
                    "h-8 flex items-center justify-between rounded-lg border px-3 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors",
                    isDayMode ? "border-slate-900/10 bg-white/70 text-slate-500 hover:bg-white hover:text-slate-800" : "border-white/5 bg-zinc-900/80 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  )}
                  aria-expanded={Boolean(openExtraCategories[category.id])}
                >
                  <span>{category.name}</span>
                  {openExtraCategories[category.id] ? <X size={11} /> : <Plus size={11} />}
                </button>
                {openExtraCategories[category.id] && renderLibraryCategory(category)}
              </div>
            ))}
          </div>
        )}
        {renderLibraryCategory(CUSTOM_CATEGORY)}
      </div>
    </section>
  );
}
