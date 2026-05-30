import { Moon, RotateCcw, Shuffle, Sun, Wand2 } from 'lucide-react';
import { AUDIO_STYLES, type AudioStyleId } from '../audio';
import {
  BPM_PRESETS,
  STYLE_PRESETS,
  type TabData,
} from '../app/model';
import { cn } from '../lib/utils';

interface WorkbenchControlsProps {
  activeTab: TabData;
  selectedStyleId: string;
  bpm: number;
  isDayMode: boolean;
  mutedTextClass: string;
  hairlineClass: string;
  softButtonClass: string;
  onApplyStylePreset: (styleId: string) => void;
  onApplyBpmPreset: (bpm: number) => void;
  onShuffleActiveTab: () => void;
  onReverseActiveTab: () => void;
  onResetWorkbench: () => void;
  onToggleColorMode: () => void;
  onStyleChange: (styleId: AudioStyleId) => void;
}

export function WorkbenchControls({
  activeTab,
  selectedStyleId,
  bpm,
  isDayMode,
  mutedTextClass,
  hairlineClass,
  softButtonClass,
  onApplyStylePreset,
  onApplyBpmPreset,
  onShuffleActiveTab,
  onReverseActiveTab,
  onResetWorkbench,
  onToggleColorMode,
  onStyleChange,
}: WorkbenchControlsProps) {
  return (
    <>
      <section className="shrink-0 flex items-center gap-3 overflow-x-auto pb-1 text-[10px] font-medium uppercase tracking-widest scrollbar-none">
        <div className={cn('flex h-10 shrink-0 items-center gap-2 rounded border px-3', isDayMode ? 'bg-slate-900/5 border-slate-900/10' : 'bg-white/5 border-white/5')}>
          <span className={mutedTextClass}>Preset</span>
          <select
            value={selectedStyleId}
            onChange={(event) => onApplyStylePreset(event.target.value)}
            className={cn('bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none', isDayMode ? 'text-slate-950' : 'text-white')}
            title="Switch loops, FX, and visual energy while keeping the current Sound Style"
          >
            {STYLE_PRESETS.map((style) => (
              <option key={style.id} value={style.id} className={isDayMode ? 'bg-white text-slate-950' : 'bg-zinc-900 text-white'}>
                {style.name}
              </option>
            ))}
          </select>
        </div>
        <div className={cn('flex h-10 shrink-0 items-center gap-1 rounded border px-2', isDayMode ? 'bg-slate-900/5 border-slate-900/10' : 'bg-white/5 border-white/5')}>
          <span className={cn('px-1 text-[10px] font-bold uppercase tracking-widest', mutedTextClass)}>BPM</span>
          {BPM_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onApplyBpmPreset(preset)}
              className={cn(
                'h-7 rounded px-2 font-mono text-[10px] font-bold transition-colors',
                bpm === preset
                  ? 'bg-emerald-500 text-white'
                  : isDayMode
                    ? 'text-slate-500 hover:bg-white hover:text-slate-950'
                    : 'text-zinc-500 hover:bg-white/10 hover:text-zinc-200',
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <button
          onClick={onShuffleActiveTab}
          className={cn('flex h-10 shrink-0 items-center gap-1.5 rounded border px-3 transition-colors', softButtonClass)}
        >
          <Shuffle size={11} />
          Shuffle
        </button>
        <button
          onClick={onReverseActiveTab}
          className={cn('flex h-10 shrink-0 items-center gap-1.5 rounded border px-3 transition-colors', softButtonClass)}
          title="Reverse the current page sequence"
        >
          <RotateCcw size={11} />
          Reverse
        </button>
        <button
          onClick={onResetWorkbench}
          className={cn('flex h-10 shrink-0 items-center gap-1.5 rounded border px-3 transition-colors', softButtonClass)}
        >
          <RotateCcw size={11} />
          Reset
        </button>
        <button
          onClick={onToggleColorMode}
          className={cn('flex h-10 shrink-0 items-center gap-1.5 rounded border px-3 transition-colors', softButtonClass)}
          aria-label={isDayMode ? 'Switch to night mode' : 'Switch to day mode'}
          title={isDayMode ? 'Switch to night mode' : 'Switch to day mode'}
        >
          {isDayMode ? <Moon size={11} /> : <Sun size={11} />}
          {isDayMode ? 'Night' : 'Day'}
        </button>
      </section>

      <section className="shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className={cn('w-4 h-4', mutedTextClass)} />
          <h2 className={cn('text-[9px] font-bold uppercase tracking-[0.2em]', isDayMode ? 'text-slate-500' : 'text-zinc-600')}>Sound Style</h2>
          <span className={cn('text-[9px] uppercase tracking-widest', isDayMode ? 'text-slate-400' : 'text-zinc-700')}>Same loops, different tone</span>
          <div className={cn('h-px flex-1', hairlineClass)} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {AUDIO_STYLES.map((style) => {
            const selected = activeTab.styleId === style.id;

            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onStyleChange(style.id)}
                className={cn(
                  'h-9 shrink-0 rounded border px-3 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2',
                  selected
                    ? isDayMode
                      ? 'border-slate-900/20 bg-white text-slate-950 shadow-sm'
                      : 'border-white/30 bg-white/15 text-white shadow-[0_0_18px_rgba(255,255,255,0.08)]'
                    : isDayMode
                      ? 'border-slate-900/10 bg-white/55 text-slate-500 hover:bg-white hover:text-slate-900'
                      : 'border-white/5 bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300',
                )}
                title={`Switch ${activeTab.name} to the ${style.name} sound without changing its loops`}
              >
                <span className={cn('h-2 w-2 rounded-full', style.accent)} />
                {style.name}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
