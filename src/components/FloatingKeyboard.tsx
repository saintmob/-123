import React from 'react';
import { Circle, Radio, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../lib/utils';
import {
  KEYBOARD_INSTRUMENT_MODES,
  KEYBOARD_KEY_ROWS,
  LIVE_FX_PRESETS,
  type KeyboardRecordingNote,
  type LiveFxControls,
  type LiveFxPreset,
} from '../app/model';

interface FloatingKeyboardProps {
  isVisible: boolean;
  keyboardInstrumentMode: string;
  isRecordingKeyboard: boolean;
  isKeyboardSustainEnabled: boolean;
  pressedKeyboardNotes: number[];
  activeLiveFx: Record<string, boolean>;
  liveFxControls: LiveFxControls;
  recordedNotes: KeyboardRecordingNote[];
  onClose: () => void;
  onInstrumentModeChange: (modeId: string) => void;
  onToggleKeyboardRecording: () => void;
  onToggleSustain: () => void;
  onKeyboardNoteDown: (note: number) => void;
  onKeyboardNoteUp: (note: number) => void;
  onLiveFxControlsChange: React.Dispatch<React.SetStateAction<LiveFxControls>>;
  onTriggerLiveFx: (preset: LiveFxPreset) => void;
}

export function FloatingKeyboard({
  isVisible,
  keyboardInstrumentMode,
  isRecordingKeyboard,
  isKeyboardSustainEnabled,
  pressedKeyboardNotes,
  activeLiveFx,
  liveFxControls,
  recordedNotes,
  onClose,
  onInstrumentModeChange,
  onToggleKeyboardRecording,
  onToggleSustain,
  onKeyboardNoteDown,
  onKeyboardNoteUp,
  onLiveFxControlsChange,
  onTriggerLiveFx,
}: FloatingKeyboardProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 p-4 border-b border-white/10">
              <div className="space-y-1">
                <h2 className="text-base font-bold uppercase tracking-[0.25em] text-zinc-100">Keyboard / Live FX</h2>
                <p className="text-[11px] text-zinc-500 max-w-xl">Tap keys for notes or trigger live sound cues with the number keys.</p>
              </div>
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors"
                aria-label="Close keyboard"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
              <section className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  {KEYBOARD_INSTRUMENT_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => onInstrumentModeChange(mode.id)}
                      className={cn(
                        "rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-all border",
                        keyboardInstrumentMode === mode.id
                          ? `${mode.color} text-white border-current`
                          : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      {mode.name}
                    </button>
                  ))}

                  <button
                    onClick={onToggleKeyboardRecording}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
                      isRecordingKeyboard
                        ? "bg-red-500 text-white border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]"
                        : "bg-white/10 text-zinc-300 border-white/10 hover:bg-white/20"
                    )}
                    aria-label={isRecordingKeyboard ? 'Stop sequencer recording' : 'Start sequencer recording'}
                  >
                    <Circle className={cn("w-4 h-4", isRecordingKeyboard ? 'text-white' : 'text-red-500')} />
                  </button>
                  <button
                    type="button"
                    onClick={onToggleSustain}
                    aria-pressed={isKeyboardSustainEnabled}
                    className={cn(
                      "rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-all",
                      isKeyboardSustainEnabled
                        ? "border-emerald-300 bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.2)]"
                        : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    Sustain
                  </button>
                </div>

                <div className="space-y-2">
                  {KEYBOARD_KEY_ROWS.map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      className={cn(
                        "grid gap-1.5",
                        rowIndex === 0 ? "grid-cols-10" : rowIndex === 1 ? "ml-[5%] grid-cols-9" : "ml-[15%] grid-cols-7"
                      )}
                    >
                      {row.map((keyDef) => {
                        const isPressed = pressedKeyboardNotes.includes(keyDef.note);
                        const instrument = KEYBOARD_INSTRUMENT_MODES.find(item => item.id === keyboardInstrumentMode) ?? KEYBOARD_INSTRUMENT_MODES[0];
                        return (
                          <button
                            key={keyDef.physicalKey}
                            onMouseDown={() => onKeyboardNoteDown(keyDef.note)}
                            onMouseUp={() => onKeyboardNoteUp(keyDef.note)}
                            onMouseLeave={() => onKeyboardNoteUp(keyDef.note)}
                            className={cn(
                              "h-16 rounded-lg border flex flex-col items-center justify-center text-xs font-mono transition-all sm:h-20",
                              isPressed
                                ? `${instrument.color} text-white border-white/50 shadow-lg shadow-current scale-105`
                                : keyDef.isBlack
                                  ? "bg-zinc-950 hover:bg-zinc-900 active:bg-zinc-800 border-white/10 text-zinc-400 hover:text-white"
                                  : "bg-zinc-100 hover:bg-white active:bg-zinc-200 border-white/20 text-zinc-900"
                            )}
                          >
                            <span>{keyDef.label}</span>
                            <span className="text-[8px] opacity-70 mt-1">{keyDef.physicalKey.toUpperCase()}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-200">Live FX</h3>
                  </div>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-zinc-500">1-8</span>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                      <span>Speed</span>
                      <span className="text-zinc-300">{liveFxControls.speed.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.05"
                      value={liveFxControls.speed}
                      onChange={(event) => onLiveFxControlsChange(prev => ({ ...prev, speed: Number(event.target.value) }))}
                      className="w-full accent-emerald-400"
                    />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                      <span>Vol</span>
                      <span className="text-zinc-300">{Math.round(liveFxControls.volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.01"
                      value={liveFxControls.volume}
                      onChange={(event) => onLiveFxControlsChange(prev => ({ ...prev, volume: Number(event.target.value) }))}
                      className="w-full accent-emerald-400"
                    />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                      <span>In</span>
                      <span className="text-zinc-300">{Math.round(liveFxControls.fadeIn * 1000)}ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="1.5"
                      step="0.01"
                      value={liveFxControls.fadeIn}
                      onChange={(event) => onLiveFxControlsChange(prev => ({ ...prev, fadeIn: Number(event.target.value) }))}
                      className="w-full accent-emerald-400"
                    />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                      <span>Out</span>
                      <span className="text-zinc-300">{Math.round(liveFxControls.fadeOut * 1000)}ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.03"
                      max="2"
                      step="0.01"
                      value={liveFxControls.fadeOut}
                      onChange={(event) => onLiveFxControlsChange(prev => ({ ...prev, fadeOut: Number(event.target.value) }))}
                      className="w-full accent-emerald-400"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {LIVE_FX_PRESETS.map((preset) => {
                    const isActive = activeLiveFx[preset.id];
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onTriggerLiveFx(preset)}
                        className={cn(
                          "min-h-20 rounded-2xl border p-3 text-left transition-all",
                          isActive
                            ? `${preset.color} text-white border-white/40 shadow-[0_0_24px_rgba(255,255,255,0.16)] scale-[1.02]`
                            : "bg-zinc-900/80 text-zinc-300 border-white/10 hover:bg-zinc-800 hover:text-white"
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-[0.16em]">{preset.name}</span>
                          <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold", isActive ? "bg-white/20 text-white" : "bg-white/5 text-zinc-500")}>
                            {preset.key}
                          </span>
                        </div>
                        <div className={cn("text-[10px] leading-snug", isActive ? "text-white/80" : "text-zinc-500")}>{preset.label}</div>
                        <div className={cn("mt-2 h-1 rounded-full", isActive ? "bg-white/70" : preset.color)} style={{ width: `${Math.min(100, preset.duration * 18)}%` }} />
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="border-t border-white/10 px-4 py-3 text-[11px] text-zinc-400 flex items-center justify-between">
              <span>{isRecordingKeyboard ? `Recording ${recordedNotes.length} notes` : 'Click the red button to capture your performance'}</span>
              <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                {keyboardInstrumentMode}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
