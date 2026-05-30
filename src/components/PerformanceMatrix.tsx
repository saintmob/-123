import { UserCircle2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import type { CSSProperties } from 'react';
import { cn } from '../lib/utils';
import type { StylePreset, TabData } from '../app/model';

interface PerformanceMatrixProps {
  activeTab: TabData;
  activeStyle: StylePreset;
  workbenchStyle: CSSProperties;
  isDayMode: boolean;
  mutedTextClass: string;
  beatEnergy: number;
  downbeat: boolean;
  sweepPosition: string;
  rhythmWave: number[];
  onDrop: (event: React.DragEvent<HTMLDivElement>, slotIndex: number) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onToggleMute: (slotIndex: number) => void;
  onModuleMouseEnter: (slotIndex: number) => void;
  onModuleMouseLeave: () => void;
  onClearSlot: (slotIndex: number) => void;
}

export function PerformanceMatrix({
  activeTab,
  activeStyle,
  workbenchStyle,
  isDayMode,
  mutedTextClass,
  beatEnergy,
  downbeat,
  sweepPosition,
  rhythmWave,
  onDrop,
  onDragOver,
  onToggleMute,
  onModuleMouseEnter,
  onModuleMouseLeave,
  onClearSlot,
}: PerformanceMatrixProps) {
  return (
    <section
      className="min-h-[410px] flex-[1.25] rounded-2xl border px-8 pt-8 pb-6 flex flex-col overflow-hidden relative transition-colors duration-150"
      style={workbenchStyle}
    >
      <div className="pointer-events-none absolute inset-0 opacity-35">
        <div
          className="absolute inset-6 rounded-2xl border transition-[opacity,transform] duration-150"
          style={{
            borderColor: activeStyle.accent,
            opacity: activeTab.isPlaying ? 0.14 + beatEnergy * 0.22 : 0,
            transform: activeTab.isPlaying ? `scale(${downbeat ? 1.015 : 1.006})` : 'scale(1)',
          }}
        />
        <div
          className="absolute inset-x-8 top-5 h-px transition-all duration-150"
          style={{
            background: `linear-gradient(90deg, transparent, ${activeStyle.accent}, transparent)`,
            opacity: activeTab.isPlaying ? 0.24 + beatEnergy * 0.44 : 0.12,
          }}
        />
        <div
          className="absolute top-8 bottom-12 w-px transition-transform duration-100"
          style={{
            left: 0,
            transform: `translateX(${sweepPosition})`,
            background: `linear-gradient(180deg, transparent, ${activeStyle.accent}, transparent)`,
            opacity: activeTab.isPlaying ? 0.16 + beatEnergy * 0.34 : 0,
          }}
        />
        <div className="absolute bottom-4 left-8 right-8 h-16 flex items-end gap-1 opacity-80">
          {rhythmWave.map((energy, index) => {
            const isCurrent = activeTab.isPlaying && index === activeTab.activeStep;
            const isDownbeat = index % 4 === 0;
            const pulseLift = isCurrent ? 12 + beatEnergy * 18 : 0;
            return (
              <div
                key={index}
                className="relative flex-1 rounded-full transition-all duration-150"
                style={{
                  height: `${6 + energy * (isDownbeat ? 34 : 26) + pulseLift}px`,
                  background: `linear-gradient(180deg, ${activeStyle.accent}, rgba(255,255,255,0.12))`,
                  opacity: isCurrent ? 0.72 : 0.08 + energy * 0.22,
                  boxShadow: isCurrent ? `0 0 ${10 + beatEnergy * 20}px ${activeStyle.glow}` : undefined,
                  transform: isCurrent ? `scaleY(${1.06 + beatEnergy * 0.18}) translateY(-${2 + beatEnergy * 5}px)` : undefined,
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className={cn('text-sm font-bold uppercase tracking-widest', isDayMode ? 'text-slate-600' : 'text-zinc-400')}>Performance Matrix</h2>
          <span
            className="rounded px-2 py-1 text-[9px] font-bold uppercase tracking-widest border"
            style={{ color: activeStyle.accent, borderColor: activeStyle.glow, background: activeStyle.panel }}
          >
            {activeStyle.name}
          </span>
        </div>
        <div className="flex gap-4">
          <span className={cn('flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest', mutedTextClass)}>
            Drag sounds into slots
          </span>
          <span className="flex items-center gap-2 text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
            <span
              className={cn('w-1.5 h-1.5 rounded-full', activeTab.isPlaying ? 'animate-pulse' : '')}
              style={{ backgroundColor: activeStyle.accent }}
            />
            {activeTab.isPlaying ? 'Playing' : 'Ready To Play'}
          </span>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-16 gap-1">
        {activeStyle.energy.map((energy, index) => {
          const isCurrent = activeTab.isPlaying && index === activeTab.activeStep;
          const isBeat = index % 4 === 0;
          const stepHeight = 6 + energy * (isBeat ? 10 : 7);
          return (
            <div
              key={index}
              className={cn(
                'rounded-full transition-all duration-150 self-end',
                isBeat ? (isDayMode ? 'bg-slate-900/15' : 'bg-white/15') : isDayMode ? 'bg-slate-900/8' : 'bg-white/8',
              )}
              style={{
                height: `${isCurrent ? stepHeight + 6 : stepHeight}px`,
                backgroundColor: isCurrent ? activeStyle.accent : undefined,
                opacity: isCurrent ? 1 : 0.25 + energy * 0.45,
                transform: isCurrent ? `translateY(-${2 + beatEnergy * 4}px)` : undefined,
                boxShadow: isCurrent ? `0 0 ${8 + beatEnergy * 14}px ${activeStyle.glow}` : undefined,
              }}
            />
          );
        })}
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center overflow-x-auto pt-3 pb-10">
        <div className="flex gap-2 sm:gap-3 justify-center flex-nowrap min-w-max">
          {activeTab.slots.map((slot, index) => {
            const currentStep = activeTab.activeStep;
            const currentPattern = slot?.pattern[currentStep];
            const isPlayingNow = activeTab.isPlaying && slot && currentPattern && (currentPattern.note || currentPattern.drum || currentPattern.exp);
            const isMuted = activeTab.mutedSlots[index];

            return (
              <div
                key={index}
                onDrop={(event) => onDrop(event, index)}
                onDragOver={onDragOver}
                onClick={() => onToggleMute(index)}
                onMouseEnter={() => onModuleMouseEnter(index)}
                onMouseLeave={onModuleMouseLeave}
                className={cn(
                  'relative w-14 h-32 sm:w-20 sm:h-44 lg:w-24 lg:h-56 rounded-xl border-2 flex flex-col items-center justify-end pb-2 transition-all overflow-hidden cursor-pointer',
                  slot
                    ? isMuted
                      ? isDayMode
                        ? 'border-slate-900/10 bg-slate-200/80'
                        : 'border-white/5 bg-zinc-900'
                      : isDayMode
                        ? 'border-slate-900/15 bg-white shadow-lg'
                        : 'border-white/20 bg-zinc-800 shadow-xl'
                    : isDayMode
                      ? 'bg-white/50 border-slate-900/15 border-dashed hover:bg-white'
                      : 'bg-white/5 border-white/10 border-dashed hover:bg-white/10',
                )}
                style={{
                  borderColor: !isMuted && isPlayingNow ? activeStyle.accent : undefined,
                  transform: !isMuted && isPlayingNow ? `translateY(-${3 + beatEnergy * 3}px)` : undefined,
                }}
              >
                {slot && activeTab.isPlaying && !isMuted && (
                  <div className="absolute left-2 right-2 top-2 z-20 flex gap-1">
                    {slot.pattern.map((step, stepIndex) => {
                      const hasHit = Boolean(step.note || step.drum || step.exp);
                      const isCurrentHit = hasHit && stepIndex === activeTab.activeStep;
                      return (
                        <span
                          key={stepIndex}
                          className="h-1 flex-1 rounded-full transition-all duration-100"
                          style={{
                            backgroundColor: hasHit ? activeStyle.accent : 'rgba(255,255,255,0.12)',
                            opacity: isCurrentHit ? 1 : hasHit ? 0.38 : 0.16,
                            transform: isCurrentHit ? 'scaleY(2.2)' : undefined,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                <AnimatePresence>
                  {slot && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: isMuted ? 0.3 : 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute inset-0 flex flex-col items-center justify-end pb-3 z-10"
                    >
                      <div
                        className={cn('w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center mb-2 border border-white/10 transition-transform duration-100', slot.color)}
                        style={{
                          transform: !isMuted && isPlayingNow ? `scale(${1.06 + beatEnergy * 0.08})` : undefined,
                        }}
                      >
                        <UserCircle2 className="w-2/3 h-2/3 text-white/80" strokeWidth={1.5} />
                      </div>

                      <div className={cn('text-[8px] sm:text-[10px] font-bold opacity-80 uppercase tracking-widest truncate w-full text-center px-1', isDayMode ? 'text-slate-700' : 'text-zinc-300')}>{slot.name}</div>

                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onClearSlot(index);
                        }}
                        className="absolute top-2 right-2 p-1 rounded-full bg-black/40 hover:bg-black/60 text-white/50 hover:text-white transition-colors"
                      >
                        <X className="w-2.5 h-2.5" strokeWidth={3} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {slot && activeTab.isPlaying && !isMuted && (
                  <motion.div
                    className={cn('absolute inset-x-0 bottom-0 opacity-20', slot.color)}
                    animate={{ height: isPlayingNow ? '100%' : '10%' }}
                    transition={{ duration: 0.1 }}
                  />
                )}

                {!slot && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <span className={cn('text-xl font-light', isDayMode ? 'text-slate-900/20' : 'text-white/10')}>+</span>
                    <span className={cn('text-[8px] font-bold uppercase tracking-widest', isDayMode ? 'text-slate-900/25' : 'text-white/15')}>Drop</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
