import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, UserCircle2, X, Mic, MicOff, Upload, Plus, RotateCcw, Shuffle, Keyboard, Circle, Wand2, Sun, Moon, Trash2, Radio, ListMusic, Scissors, Copy, MoveHorizontal, SkipBack, SkipForward, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AUDIO_STYLES, AVAILABLE_SOUNDS, AudioStyleId, SoundDef, engineManager, FxParams, defaultFx, KEYBOARD_NOTES } from './audio';
import { cn } from './lib/utils';
import { createShowControlClient, type AudioFrameMessage, type ControlCommand } from './lib/showControlClient';

const KEYBOARD_INSTRUMENT_MODES = [
  { id: 'piano', name: 'Piano', color: 'bg-blue-500', waveform: 'sine' as OscillatorType },
  { id: 'synth', name: 'Synth', color: 'bg-purple-500', waveform: 'sawtooth' as OscillatorType },
  { id: 'bass', name: 'Bass', color: 'bg-cyan-500', waveform: 'square' as OscillatorType },
  { id: 'bell', name: 'Bell', color: 'bg-amber-500', waveform: 'triangle' as OscillatorType },
];

const KEYBOARD_PHYSICAL_KEYS = ['a','s','d','f','g','h','j','k','l','q','w','e','r','t','y','u'];
const KEYBOARD_NOTE_LABELS = ['C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5','C#5','D5','D#5'];
const FLAT_KEYBOARD_NOTES = KEYBOARD_NOTES.flat();

type LiveFxKind = 'heartbeat' | 'atmosphere' | 'riser' | 'impact' | 'stutter' | 'air' | 'alarm' | 'spark';

interface LiveFxPreset {
  id: LiveFxKind;
  name: string;
  key: string;
  label: string;
  color: string;
  duration: number;
}

interface LiveFxControls {
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

const LIVE_FX_PRESETS: LiveFxPreset[] = [
  { id: 'heartbeat', name: 'Heartbeat', key: '1', label: 'Pulse tension', color: 'bg-red-500', duration: 4.2 },
  { id: 'atmosphere', name: 'Atmosphere', key: '2', label: 'Dark room bed', color: 'bg-indigo-500', duration: 5.2 },
  { id: 'riser', name: 'Riser', key: '3', label: 'Build transition', color: 'bg-cyan-500', duration: 3.4 },
  { id: 'impact', name: 'Impact', key: '4', label: 'Scene hit', color: 'bg-orange-500', duration: 2.4 },
  { id: 'stutter', name: 'Stutter', key: '5', label: 'Glitch cue', color: 'bg-fuchsia-500', duration: 2.1 },
  { id: 'air', name: 'Air Wash', key: '6', label: 'Soft sweep', color: 'bg-sky-500', duration: 4.5 },
  { id: 'alarm', name: 'Warning', key: '7', label: 'Alert pulse', color: 'bg-amber-500', duration: 3.2 },
  { id: 'spark', name: 'Sparkle', key: '8', label: 'Bright accent', color: 'bg-emerald-500', duration: 2.6 },
];

interface TabData {
  id: string;
  name: string;
  slots: (SoundDef | null)[];
  mutedSlots: boolean[];
  fxSlots: FxParams[];
  masterFx: FxParams;
  styleId: AudioStyleId;
  isPlaying: boolean;
  activeStep: number;
}

type ViewMode = 'matrix' | 'timeline';
type GlobalRecordingState = 'idle' | 'waiting' | 'recording' | 'stopping';

interface ArrangementEvent {
  id: string;
  tabId: string;
  tabName: string;
  startMs: number;
  durationMs?: number;
  tab: TabData;
}

interface TimelineClip {
  id: string;
  soundId: string;
  track: number;
  start: number;
  duration: number;
  trimStart: number;
}

interface TimelinePointerEdit {
  clipId: string;
  mode: 'move' | 'trim-start' | 'trim-end';
  pointerStartX: number;
  pointerStartY: number;
  clipStart: number;
  clipDuration: number;
  clipTrimStart: number;
  clipTrack: number;
}

interface TimelineTransportEdit {
  mode: 'playhead' | 'range-start' | 'range-end' | 'range-move';
  pointerStartX: number;
  rangeStart: number;
  rangeEnd: number;
  playhead: number;
  wasPlaying: boolean;
}

interface StylePreset {
  id: string;
  name: string;
  slotIds: string[];
  accent: string;
  glow: string;
  panel: string;
  energy: number[];
  fxSlots: FxParams[];
  masterFx: FxParams;
}

type ColorMode = 'night' | 'day';
type AudioTransportState = 'stopped' | 'playing' | 'paused';

type MixerAudioTelemetry = AudioFrameMessage & {
  beat: number;
  activeStep: number;
  transport: AudioTransportState;
  activePreset: string;
  styleId: string;
  masterLevel: number;
  slotLevels: number[];
  slotActivity: number[];
  stepProgress: number;
  styleEnergy: number;
  tabCount: number;
};

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const BAND_SHAPE = [0.22, 0.45, 0.74, 1, 0.74, 0.45, 0.22];
const CATEGORY_BAND_CENTERS: Record<string, number> = {
  beat: 1,
  bass: 3,
  melody: 7,
  theme: 8,
  animal: 9,
  custom: 6,
  effect: 12,
  experimental: 14,
};
const CATEGORY_IMPACT: Record<string, number> = {
  beat: 1,
  bass: 0.92,
  melody: 0.8,
  theme: 0.84,
  animal: 0.78,
  custom: 0.76,
  effect: 0.68,
  experimental: 0.64,
};

const makeFx = (overrides: Partial<FxParams> = {}): FxParams => ({
  ...defaultFx(),
  ...overrides,
});

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'neon',
    name: 'Neon Loop',
    slotIds: ['b1', 'e5', 's3', 't6', 't3', 'm5', 'x1'],
    accent: '#34d399',
    glow: 'rgba(52, 211, 153, 0.32)',
    panel: 'rgba(16, 185, 129, 0.08)',
    energy: [1, 0.36, 0.7, 0.42, 0.94, 0.38, 0.78, 0.44, 1, 0.34, 0.72, 0.4, 0.92, 0.36, 0.76, 0.48],
    fxSlots: [
      makeFx({ volume: 92, compressor: 32 }),
      makeFx({ hpf: 8, volume: 58, panSwing: 18 }),
      makeFx({ lpf: 62, volume: 86, sidechain: 30, compressor: 46 }),
      makeFx({ lpf: 55, volume: 46, sidechain: 22, reverb: 36 }),
      makeFx({ lpf: 72, volume: 54, delay: 12, reverb: 24 }),
      makeFx({ hpf: 12, volume: 48, delay: 34, panSwing: 30 }),
      makeFx({ hpf: 18, volume: 28, delay: 16, flanger: 26 }),
    ],
    masterFx: makeFx({ volume: 88, compressor: 18, reverb: 8 }),
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    slotIds: ['b3', 'e3', 's4', 'm2', 't4', 'e4', 'x2'],
    accent: '#60a5fa',
    glow: 'rgba(96, 165, 250, 0.3)',
    panel: 'rgba(37, 99, 235, 0.09)',
    energy: [1, 0.52, 0.82, 0.55, 1, 0.5, 0.85, 0.58, 1, 0.5, 0.82, 0.54, 1, 0.5, 0.9, 0.62],
    fxSlots: [
      makeFx({ volume: 96, compressor: 48 }),
      makeFx({ hpf: 18, volume: 42, panSwing: 10 }),
      makeFx({ lpf: 50, volume: 92, sidechain: 42, compressor: 58 }),
      makeFx({ lpf: 68, volume: 52, delay: 18 }),
      makeFx({ hpf: 8, lpf: 70, volume: 46, reverb: 20 }),
      makeFx({ hpf: 14, volume: 38, reverb: 12 }),
      makeFx({ hpf: 22, volume: 24, delay: 24, flanger: 34 }),
    ],
    masterFx: makeFx({ volume: 90, compressor: 30 }),
  },
  {
    id: 'dream',
    name: 'Dream Pop',
    slotIds: ['b2', 'e2', 's1', 'm1', 't6', 'm5', 'x3'],
    accent: '#f472b6',
    glow: 'rgba(244, 114, 182, 0.3)',
    panel: 'rgba(219, 39, 119, 0.08)',
    energy: [0.8, 0.34, 0.62, 0.38, 0.72, 0.34, 0.64, 0.44, 0.78, 0.32, 0.58, 0.38, 0.68, 0.34, 0.62, 0.48],
    fxSlots: [
      makeFx({ volume: 72, compressor: 18 }),
      makeFx({ hpf: 12, volume: 36, panSwing: 28 }),
      makeFx({ lpf: 48, volume: 64, sidechain: 20 }),
      makeFx({ lpf: 58, volume: 54, reverb: 48, delay: 18 }),
      makeFx({ lpf: 42, volume: 50, sidechain: 18, reverb: 58 }),
      makeFx({ hpf: 20, volume: 44, delay: 42, panSwing: 44 }),
      makeFx({ hpf: 8, volume: 18, reverb: 35, flanger: 18 }),
    ],
    masterFx: makeFx({ volume: 82, reverb: 18, compressor: 12 }),
  },
  {
    id: 'breaks',
    name: 'Break Lab',
    slotIds: ['b2', 'e5', 's5', 'm4', 't2', 'e1', 'x1'],
    accent: '#f97316',
    glow: 'rgba(249, 115, 22, 0.28)',
    panel: 'rgba(234, 88, 12, 0.08)',
    energy: [1, 0.42, 0.68, 0.54, 0.88, 0.5, 0.76, 0.44, 0.94, 0.38, 0.82, 0.52, 0.9, 0.44, 0.72, 0.58],
    fxSlots: [
      makeFx({ volume: 94, compressor: 40 }),
      makeFx({ hpf: 10, volume: 54, panSwing: 24 }),
      makeFx({ lpf: 58, volume: 84, sidechain: 24, compressor: 36 }),
      makeFx({ lpf: 74, volume: 56, delay: 10 }),
      makeFx({ lpf: 66, volume: 50, reverb: 18 }),
      makeFx({ hpf: 18, volume: 38, panSwing: 36 }),
      makeFx({ hpf: 20, volume: 32, delay: 20, flanger: 24 }),
    ],
    masterFx: makeFx({ volume: 88, compressor: 24, reverb: 6 }),
  },
  {
    id: 'indie',
    name: 'Indie Band',
    slotIds: ['b6', 'e6', 's8', 'm8', 't7', 'm6', 'x7'],
    accent: '#a3e635',
    glow: 'rgba(163, 230, 53, 0.24)',
    panel: 'rgba(101, 163, 13, 0.08)',
    energy: [0.92, 0.4, 0.66, 0.5, 0.86, 0.36, 0.72, 0.48, 0.94, 0.38, 0.7, 0.46, 0.84, 0.4, 0.68, 0.52],
    fxSlots: [
      makeFx({ volume: 88, compressor: 34 }),
      makeFx({ hpf: 14, volume: 46, panSwing: 18 }),
      makeFx({ lpf: 58, volume: 78, compressor: 22 }),
      makeFx({ hpf: 10, lpf: 76, volume: 56, reverb: 14 }),
      makeFx({ lpf: 74, volume: 52, delay: 10, reverb: 18 }),
      makeFx({ lpf: 82, volume: 44, delay: 16 }),
      makeFx({ hpf: 22, volume: 16, reverb: 28 }),
    ],
    masterFx: makeFx({ volume: 86, compressor: 18, reverb: 6 }),
  },
  {
    id: 'rnb',
    name: 'R&B Studio',
    slotIds: ['b7', 'e7', 's7', 'm6', 't8', 'm9', 'x6'],
    accent: '#c084fc',
    glow: 'rgba(192, 132, 252, 0.24)',
    panel: 'rgba(126, 34, 206, 0.08)',
    energy: [0.78, 0.34, 0.52, 0.44, 0.74, 0.36, 0.58, 0.5, 0.82, 0.32, 0.54, 0.42, 0.72, 0.34, 0.6, 0.48],
    fxSlots: [
      makeFx({ volume: 76, compressor: 18 }),
      makeFx({ hpf: 18, volume: 34, panSwing: 34 }),
      makeFx({ lpf: 50, volume: 76, sidechain: 12, compressor: 28 }),
      makeFx({ lpf: 66, volume: 50, reverb: 32, delay: 16 }),
      makeFx({ lpf: 72, volume: 48, delay: 22, reverb: 24 }),
      makeFx({ hpf: 20, volume: 34, delay: 40, panSwing: 38 }),
      makeFx({ hpf: 24, volume: 12, flanger: 12 }),
    ],
    masterFx: makeFx({ volume: 82, compressor: 14, reverb: 12 }),
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    slotIds: ['b9', 'e8', 's8', 't9', 'm9', 't5', 'x7'],
    accent: '#facc15',
    glow: 'rgba(250, 204, 21, 0.22)',
    panel: 'rgba(202, 138, 4, 0.08)',
    energy: [0.7, 0.24, 0.38, 0.28, 0.62, 0.24, 0.42, 0.32, 0.82, 0.26, 0.5, 0.34, 0.72, 0.24, 0.44, 0.4],
    fxSlots: [
      makeFx({ lpf: 62, volume: 64, compressor: 12, reverb: 20 }),
      makeFx({ hpf: 22, volume: 24, reverb: 30 }),
      makeFx({ lpf: 42, volume: 60, reverb: 24 }),
      makeFx({ lpf: 48, volume: 58, reverb: 68, delay: 18 }),
      makeFx({ hpf: 18, lpf: 70, volume: 36, delay: 44, reverb: 48 }),
      makeFx({ lpf: 60, volume: 38, reverb: 54 }),
      makeFx({ hpf: 18, volume: 20, delay: 30, reverb: 40 }),
    ],
    masterFx: makeFx({ volume: 78, reverb: 26, compressor: 10 }),
  },
  {
    id: 'latin',
    name: 'Latin Pop',
    slotIds: ['b8', 'e6', 's7', 'm8', 't10', 'e9', 'x5'],
    accent: '#fb7185',
    glow: 'rgba(251, 113, 133, 0.24)',
    panel: 'rgba(225, 29, 72, 0.08)',
    energy: [0.96, 0.48, 0.7, 0.58, 0.9, 0.5, 0.76, 0.56, 0.98, 0.46, 0.72, 0.58, 0.88, 0.48, 0.74, 0.62],
    fxSlots: [
      makeFx({ volume: 88, compressor: 26 }),
      makeFx({ hpf: 16, volume: 48, panSwing: 30 }),
      makeFx({ lpf: 56, volume: 74, compressor: 22 }),
      makeFx({ hpf: 12, lpf: 78, volume: 50, reverb: 18 }),
      makeFx({ lpf: 78, volume: 52, delay: 14, reverb: 16 }),
      makeFx({ hpf: 20, volume: 34, panSwing: 48 }),
      makeFx({ hpf: 16, volume: 18, delay: 18, flanger: 16 }),
    ],
    masterFx: makeFx({ volume: 86, compressor: 18, reverb: 8 }),
  },
  {
    id: 'neo-soul',
    name: 'Neo Soul R&B',
    slotIds: ['b10', 'e10', 's13', 'm10', 't11', 'm15', 'x9'],
    accent: '#d8b4fe',
    glow: 'rgba(216, 180, 254, 0.22)',
    panel: 'rgba(147, 51, 234, 0.07)',
    energy: [0.74, 0.3, 0.5, 0.42, 0.7, 0.34, 0.58, 0.46, 0.78, 0.32, 0.52, 0.42, 0.68, 0.34, 0.56, 0.48],
    fxSlots: [
      makeFx({ volume: 72, compressor: 16, reverb: 8 }),
      makeFx({ hpf: 16, volume: 30, panSwing: 42 }),
      makeFx({ lpf: 44, volume: 76, compressor: 24, sidechain: 8 }),
      makeFx({ lpf: 58, volume: 52, reverb: 42, delay: 18 }),
      makeFx({ lpf: 70, volume: 46, reverb: 30, delay: 22 }),
      makeFx({ lpf: 46, volume: 34, reverb: 56 }),
      makeFx({ hpf: 20, volume: 12, delay: 20, flanger: 10 }),
    ],
    masterFx: makeFx({ volume: 80, compressor: 12, reverb: 14 }),
  },
  {
    id: 'edm',
    name: 'EDM Festival',
    slotIds: ['b11', 'e11', 's12', 'm11', 't12', 't16', 'x8'],
    accent: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.24)',
    panel: 'rgba(8, 145, 178, 0.08)',
    energy: [1, 0.54, 0.9, 0.58, 1, 0.56, 0.94, 0.62, 1, 0.54, 0.92, 0.58, 1, 0.56, 0.96, 0.66],
    fxSlots: [
      makeFx({ volume: 94, compressor: 42 }),
      makeFx({ hpf: 18, volume: 40, panSwing: 12 }),
      makeFx({ lpf: 72, volume: 86, sidechain: 58, compressor: 52 }),
      makeFx({ hpf: 8, lpf: 82, volume: 54, delay: 18 }),
      makeFx({ lpf: 88, volume: 58, sidechain: 34, delay: 18, reverb: 16 }),
      makeFx({ hpf: 10, volume: 42, delay: 32, panSwing: 30 }),
      makeFx({ hpf: 20, volume: 26, delay: 22, flanger: 28 }),
    ],
    masterFx: makeFx({ volume: 88, compressor: 34, reverb: 6 }),
  },
  {
    id: 'hiphop',
    name: 'Hip Hop Tape',
    slotIds: ['b12', 'e12', 's14', 'm12', 't13', 'm10', 'x9'],
    accent: '#fbbf24',
    glow: 'rgba(251, 191, 36, 0.22)',
    panel: 'rgba(180, 83, 9, 0.07)',
    energy: [0.9, 0.32, 0.62, 0.42, 0.84, 0.34, 0.58, 0.48, 0.9, 0.3, 0.64, 0.4, 0.82, 0.34, 0.6, 0.5],
    fxSlots: [
      makeFx({ volume: 86, compressor: 34 }),
      makeFx({ hpf: 16, volume: 38, panSwing: 20 }),
      makeFx({ lpf: 40, volume: 82, compressor: 28 }),
      makeFx({ lpf: 56, volume: 44, reverb: 24 }),
      makeFx({ lpf: 68, volume: 46, delay: 14, reverb: 16 }),
      makeFx({ hpf: 8, lpf: 60, volume: 32, reverb: 28 }),
      makeFx({ hpf: 14, volume: 20, delay: 18, flanger: 8 }),
    ],
    masterFx: makeFx({ volume: 84, compressor: 24, reverb: 8 }),
  },
  {
    id: 'drill',
    name: 'Drill Bells',
    slotIds: ['b13', 'e13', 's10', 'm13', 't13', 'e12', 'x5'],
    accent: '#818cf8',
    glow: 'rgba(129, 140, 248, 0.24)',
    panel: 'rgba(67, 56, 202, 0.08)',
    energy: [0.88, 0.42, 0.68, 0.48, 0.9, 0.42, 0.72, 0.52, 0.92, 0.44, 0.7, 0.5, 0.86, 0.42, 0.74, 0.56],
    fxSlots: [
      makeFx({ volume: 84, compressor: 30 }),
      makeFx({ hpf: 20, volume: 34, panSwing: 34 }),
      makeFx({ lpf: 46, volume: 86, sidechain: 10, pitch: -2, compressor: 34 }),
      makeFx({ hpf: 14, lpf: 62, volume: 48, delay: 30, reverb: 22 }),
      makeFx({ hpf: 8, lpf: 70, volume: 42, delay: 18 }),
      makeFx({ hpf: 18, volume: 26, panSwing: 42 }),
      makeFx({ hpf: 16, volume: 16, delay: 24, flanger: 18 }),
    ],
    masterFx: makeFx({ volume: 82, compressor: 22, reverb: 10 }),
  },
  {
    id: 'dub-bass',
    name: 'Echo Bass',
    slotIds: ['b14', 'e14', 's11', 'm14', 't14', 'e9', 'x10'],
    accent: '#2dd4bf',
    glow: 'rgba(45, 212, 191, 0.24)',
    panel: 'rgba(13, 148, 136, 0.08)',
    energy: [0.96, 0.3, 0.54, 0.36, 0.78, 0.3, 0.58, 0.42, 0.96, 0.32, 0.56, 0.38, 0.84, 0.3, 0.62, 0.46],
    fxSlots: [
      makeFx({ lpf: 66, volume: 80, compressor: 24, reverb: 10 }),
      makeFx({ hpf: 18, volume: 26, delay: 44, reverb: 18 }),
      makeFx({ lpf: 38, volume: 90, sidechain: 22, flanger: 20, compressor: 36 }),
      makeFx({ hpf: 12, lpf: 54, volume: 40, delay: 56, reverb: 30 }),
      makeFx({ lpf: 46, volume: 50, sidechain: 18, flanger: 18 }),
      makeFx({ hpf: 22, volume: 24, panSwing: 46 }),
      makeFx({ hpf: 16, volume: 20, delay: 60, reverb: 26 }),
    ],
    masterFx: makeFx({ volume: 82, compressor: 20, reverb: 16 }),
  },
  {
    id: 'afro-rnb',
    name: 'Afro R&B',
    slotIds: ['b15', 'e15', 's15', 'm8', 't15', 'm15', 'x6'],
    accent: '#fb923c',
    glow: 'rgba(251, 146, 60, 0.22)',
    panel: 'rgba(194, 65, 12, 0.08)',
    energy: [0.94, 0.46, 0.7, 0.54, 0.88, 0.48, 0.76, 0.58, 0.96, 0.44, 0.72, 0.54, 0.86, 0.48, 0.78, 0.6],
    fxSlots: [
      makeFx({ volume: 84, compressor: 22 }),
      makeFx({ hpf: 16, volume: 42, panSwing: 36 }),
      makeFx({ lpf: 54, volume: 78, compressor: 22 }),
      makeFx({ hpf: 10, lpf: 78, volume: 48, reverb: 16 }),
      makeFx({ lpf: 72, volume: 50, delay: 16, reverb: 18 }),
      makeFx({ lpf: 48, volume: 34, reverb: 44 }),
      makeFx({ hpf: 18, volume: 14, delay: 16, flanger: 12 }),
    ],
    masterFx: makeFx({ volume: 84, compressor: 18, reverb: 8 }),
  },
];

const STORAGE_KEY = 'codex-music-workbench-v1';
const COLOR_MODE_STORAGE_KEY = 'codex-music-workbench-color-mode';

const findSound = (id: string) => AVAILABLE_SOUNDS.find((sound) => sound.id === id) ?? null;

const audioStyleForPreset = (presetId: string): AudioStyleId => {
  if (['warehouse', 'edm'].includes(presetId)) return 'club';
  if (['breaks', 'dub-bass'].includes(presetId)) return 'techno';
  if (['dream', 'cinematic'].includes(presetId)) return 'synthwave';
  if (['hiphop', 'drill'].includes(presetId)) return 'trap';
  if (['indie', 'rnb', 'neo-soul', 'afro-rnb', 'latin'].includes(presetId)) return 'piano';
  return 'default';
};

const createStyleTab = (preset: StylePreset, id = 'tab-1', styleId: AudioStyleId = audioStyleForPreset(preset.id)): TabData => {
  const slots = preset.slotIds.map(findSound);

  return {
    id,
    name: preset.name,
    slots,
    mutedSlots: new Array(7).fill(false),
    fxSlots: preset.fxSlots,
    masterFx: preset.masterFx,
    styleId,
    isPlaying: false,
    activeStep: 0
  };
};

const createCodexSongTab = (): TabData => createStyleTab(STYLE_PRESETS[0]);

const hasStepHit = (slot: SoundDef | null, step: number) => {
  if (!slot) return false;
  const stepData = slot.pattern[step];
  return Boolean(stepData && (stepData.note || stepData.drum || stepData.exp));
};

const getStepProgress = (bpm: number) => {
  const safeBpm = Math.max(1, bpm || 120);
  const stepDurationMs = 60000 / safeBpm / 4;
  return (performance.now() % stepDurationMs) / stepDurationMs;
};

const buildFrequencyBands = (
  tab: TabData,
  style: StylePreset,
  masterLevel: number,
  slotLevels: number[],
  slotActivity: number[],
  stepProgress: number,
) => {
  const bands = style.energy.map((energy, index) => clampUnit(0.08 + energy * 0.58 + index * 0.003));
  const pulse = Math.pow(Math.sin(Math.PI * clampUnit(stepProgress)), 2);
  const activeStep = tab.activeStep % 16;
  const beatLift = tab.isPlaying ? 0.16 + pulse * 0.22 : 0.04;
  bands[activeStep] = clampUnit((bands[activeStep] ?? 0) + beatLift);
  bands[(activeStep + 4) % 16] = clampUnit((bands[(activeStep + 4) % 16] ?? 0) + beatLift * 0.38);
  bands[(activeStep + 8) % 16] = clampUnit((bands[(activeStep + 8) % 16] ?? 0) + beatLift * 0.16);

  tab.slots.forEach((slot, index) => {
    if (!slot) return;
    const level = slotLevels[index] ?? 0;
    if (level <= 0) return;

    const activity = slotActivity[index] ?? 0;
    const impact = level * (0.16 + activity * 0.34) * (CATEGORY_IMPACT[slot.category] ?? 0.7);
    const center = CATEGORY_BAND_CENTERS[slot.category] ?? 8;

    for (let offset = -3; offset <= 3; offset += 1) {
      const bandIndex = center + offset;
      if (bandIndex < 0 || bandIndex >= bands.length) continue;
      bands[bandIndex] = clampUnit((bands[bandIndex] ?? 0) + impact * BAND_SHAPE[offset + 3]);
    }
  });

  const lift = masterLevel * (tab.isPlaying ? 0.14 : 0.06);
  return bands.map((band, index) => clampUnit(band + lift * (index < 4 ? 0.28 : index < 10 ? 0.16 : 0.1)));
};

const buildMixerTelemetry = (
  tab: TabData,
  style: StylePreset,
  bpm: number,
  tabCount: number,
): MixerAudioTelemetry => {
  const masterLevel = clampUnit((tab.masterFx.volume ?? 0) / 100);
  const slotLevels = tab.fxSlots.map((fx, index) => (tab.mutedSlots[index] ? 0 : clampUnit((fx?.volume ?? 0) / 100)));
  const slotActivity = tab.slots.map((slot) => (tab.isPlaying ? (hasStepHit(slot, tab.activeStep) ? 1 : 0) : 0));
  const activeSlotCount = tab.slots.filter(Boolean).length;
  const activeHits = slotActivity.reduce((sum, value) => sum + value, 0);
  const slotMean = average(slotLevels);
  const stepEnergy = style.energy[tab.activeStep] ?? 0.5;
  const stepProgress = getStepProgress(bpm);
  const pulse = tab.isPlaying ? Math.pow(Math.sin(Math.PI * clampUnit(stepProgress)), 2) : 0.12;
  const level = clampUnit(0.06 + masterLevel * 0.38 + slotMean * 0.24 + stepEnergy * 0.18 + (activeHits / Math.max(1, activeSlotCount)) * 0.1 + pulse * 0.12);
  const rms = clampUnit(level * (tab.isPlaying ? 0.84 + stepEnergy * 0.08 : 0.66));
  const peak = clampUnit(Math.max(level, rms + (tab.isPlaying ? 0.12 + pulse * 0.08 : 0.06)));
  const muted = !tab.isPlaying || masterLevel <= 0.01;
  const frequencyBands = buildFrequencyBands(tab, style, masterLevel, slotLevels, slotActivity, stepProgress);

  return {
    type: 'mixer.audioFrame',
    sourceId: tab.id,
    deviceId: 'mixer-target-123',
    displayName: `${tab.name} · ${style.name}`,
    timestamp: Date.now(),
    level,
    rms,
    peak,
    gain: masterLevel,
    muted,
    speaking: !muted && (level > 0.14 || activeHits > 0),
    frequencyBands,
    beat: tab.isPlaying ? tab.activeStep % 4 : 0,
    activeStep: tab.activeStep,
    transport: tab.isPlaying ? 'playing' : 'stopped',
    activePreset: style.name,
    styleId: style.id,
    bpm,
    masterLevel,
    slotLevels,
    slotActivity,
    stepProgress,
    styleEnergy: stepEnergy,
    tabCount,
  };
};

const CLIP_COLOR_CLASSES = ['bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-fuchsia-500', 'bg-rose-500', 'bg-lime-500'];
const TIMELINE_TRACKS = 5;
const DEFAULT_TIMELINE_SECONDS = 32;
const PIXELS_PER_SECOND = 84;
const TIMELINE_SNAP = 0.25;
const TRACK_ROW_HEIGHT = 104;

const getInternalRecordingMimeType = () => {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
};

const cloneTabForRecording = (tab: TabData): TabData => ({
  ...tab,
  slots: [...tab.slots],
  mutedSlots: [...tab.mutedSlots],
  fxSlots: tab.fxSlots.map(fx => ({ ...fx })),
  masterFx: { ...tab.masterFx },
  isPlaying: false,
  activeStep: 0,
});

const triggerOfflineDrum = (ctx: OfflineAudioContext, destination: AudioNode, type: string, time: number, gainValue = 0.55) => {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + (type === 'kick' ? 0.38 : 0.14));
  gain.connect(destination);

  if (type === 'kick') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.34);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 0.38);
    return;
  }

  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.18)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.055));
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  filter.type = type === 'hihat' ? 'highpass' : 'bandpass';
  filter.frequency.value = type === 'hihat' ? 5200 : 1600;
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  source.start(time);
};

const triggerOfflineSynth = (ctx: OfflineAudioContext, destination: AudioNode, midiNote: number, category: string, time: number, gainValue = 0.18) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const isBass = category === 'bass';
  const frequency = 440 * Math.pow(2, (midiNote - 69) / 12) * (isBass ? 0.5 : 1);
  osc.type = isBass ? 'square' : category === 'theme' ? 'triangle' : 'sawtooth';
  osc.frequency.value = frequency;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(isBass ? 700 : 1800, time);
  gain.gain.setValueAtTime(gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + (isBass ? 0.42 : 0.3));
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  osc.start(time);
  osc.stop(time + (isBass ? 0.46 : 0.34));
};

const renderArrangementBuffer = async (events: ArrangementEvent[]): Promise<AudioBuffer | null> => {
  const usableEvents = events.filter(event => (event.durationMs ?? 0) > 120);
  if (!usableEvents.length) return null;

  const sampleRate = 44100;
  const totalSeconds = Math.min(48, Math.max(...usableEvents.map(event => (event.startMs + (event.durationMs ?? 0)) / 1000)) + 0.5);
  const ctx = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
  const stepDuration = 60 / 120 / 4;

  usableEvents.forEach((event) => {
    const eventStart = event.startMs / 1000;
    const eventDuration = Math.max(0.5, (event.durationMs ?? 2000) / 1000);

    event.tab.slots.forEach((slot, slotIndex) => {
      if (!slot || event.tab.mutedSlots[slotIndex]) return;
      const channelGain = ctx.createGain();
      channelGain.gain.value = Math.max(0.05, Math.min(1, event.tab.fxSlots[slotIndex]?.volume ?? 100) / 100) * 0.7;
      channelGain.connect(ctx.destination);

      if (slot.buffer) {
        let cursor = eventStart;
        const loopLength = slot.playMode === 'buffer' || slot.loopMode === 'full' ? Math.min(slot.buffer.duration, eventDuration) : stepDuration;
        while (cursor < eventStart + eventDuration) {
          const source = ctx.createBufferSource();
          source.buffer = slot.buffer;
          source.connect(channelGain);
          source.start(cursor, 0, Math.min(loopLength, eventStart + eventDuration - cursor));
          cursor += Math.max(stepDuration, loopLength);
        }
        return;
      }

      for (let t = 0; t < eventDuration; t += stepDuration * 16) {
        slot.pattern.forEach((step, stepIndex) => {
          const when = eventStart + t + stepIndex * stepDuration;
          if (when > eventStart + eventDuration) return;
          if (step.drum) triggerOfflineDrum(ctx, channelGain, step.drum, when);
          if (step.note) {
            const notes = Array.isArray(step.note) ? step.note : [step.note];
            notes.forEach(note => triggerOfflineSynth(ctx, channelGain, note, slot.category, when));
          }
          if (step.exp) triggerOfflineDrum(ctx, channelGain, step.exp === 'laser' ? 'clap' : 'hihat', when, 0.22);
        });
      }
    });
  });

  return ctx.startRendering();
};

const hydrateColorMode = (): ColorMode => {
  if (typeof window === 'undefined') return 'night';
  return window.localStorage.getItem(COLOR_MODE_STORAGE_KEY) === 'day' ? 'day' : 'night';
};

const hydrateSavedTabs = (): { tabs: TabData[]; styleId: string } | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as {
      styleId?: string;
      tabs?: Array<Omit<TabData, 'slots'> & { slotIds: Array<string | null> }>;
    };
    const tabs = saved.tabs?.map((tab) => ({
      ...tab,
      slots: tab.slotIds.map((id) => id ? findSound(id) : null),
      styleId: tab.styleId ?? 'default',
      isPlaying: false,
      activeStep: 0,
    }));

    if (!tabs?.length) return null;
    return { tabs, styleId: saved.styleId ?? STYLE_PRESETS[0].id };
  } catch {
    return null;
  }
};

export default function App() {
  const [initialWorkbench] = useState(hydrateSavedTabs);
  const [tabs, setTabs] = useState<TabData[]>(() => initialWorkbench?.tabs ?? [createCodexSongTab()]);
  const [selectedStyleId, setSelectedStyleId] = useState(initialWorkbench?.styleId ?? STYLE_PRESETS[0].id);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'loaded'>('idle');
  const [colorMode, setColorMode] = useState<ColorMode>(hydrateColorMode);
  const [pendingPlayIds, setPendingPlayIds] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('matrix');
  const [isGlobalRecording, setIsGlobalRecording] = useState(false);
  const [globalRecordingState, setGlobalRecordingState] = useState<GlobalRecordingState>('idle');
  const [arrangementEvents, setArrangementEvents] = useState<ArrangementEvent[]>([]);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [selectedTimelineClipId, setSelectedTimelineClipId] = useState<string | null>(null);
  const [timelinePlayhead, setTimelinePlayhead] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [timelineDuration, setTimelineDuration] = useState(DEFAULT_TIMELINE_SECONDS);
  const [timelineLoopRange, setTimelineLoopRange] = useState({ start: 0, end: 8 });
  const [bpm, setBpm] = useState(engineManager.bpm);
  
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const activeStyle = STYLE_PRESETS.find((style) => style.id === selectedStyleId) ?? STYLE_PRESETS[0];
  const beatEnergy = activeTab.isPlaying ? activeStyle.energy[activeTab.activeStep] ?? 0.5 : 0;
  const downbeat = activeTab.activeStep % 4 === 0;
  const sweepPosition = `${(activeTab.activeStep / 15) * 100}%`;
  const rhythmWave = activeStyle.energy.map((energy, index) => {
    const accent = index % 4 === 0 ? 0.22 : index % 2 === 0 ? 0.1 : -0.04;
    return Math.max(0.08, Math.min(1, energy + accent));
  });

  const [hoveredFxSlot, setHoveredFxSlot] = useState<number | null>(null);
  const fxTimeoutRef = useRef<NodeJS.Timeout>();

  const [hoveredTabFxId, setHoveredTabFxId] = useState<string | null>(null);
  const tabFxTimeoutRef = useRef<NodeJS.Timeout>();

  // Recording & Upload states
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSounds, setRecordedSounds] = useState<SoundDef[]>([]);
  const [isExtraLibraryOpen, setIsExtraLibraryOpen] = useState(false);
  const [openExtraCategories, setOpenExtraCategories] = useState<Record<string, boolean>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const globalRecordStartedAtRef = useRef<number>(0);
  const globalRecorderRef = useRef<MediaRecorder | null>(null);
  const globalRecordChunksRef = useRef<Blob[]>([]);
  const globalRecordingStateRef = useRef<GlobalRecordingState>('idle');
  const globalRecordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startGlobalRecordingRef = useRef<() => void>(() => {});
  const stopGlobalRecordingRef = useRef<() => void>(() => {});
  const timelineGridRef = useRef<HTMLDivElement>(null);
  const timelineEditRef = useRef<TimelinePointerEdit | null>(null);
  const timelineTransportEditRef = useRef<TimelineTransportEdit | null>(null);
  const timelineSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const timelineAnimationRef = useRef<number | null>(null);
  const timelineStartedAtRef = useRef(0);
  const timelineOffsetRef = useRef(0);
  const timelineLoopRangeRef = useRef(timelineLoopRange);
  const timelinePlayheadRef = useRef(timelinePlayhead);

  // Keyboard states
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isRecordingKeyboard, setIsRecordingKeyboard] = useState(false);
  const [keyboardInstrumentMode, setKeyboardInstrumentMode] = useState(KEYBOARD_INSTRUMENT_MODES[0].id);
  const [recordedNotes, setRecordedNotes] = useState<{time: number, note: number}[]>([]);
  const [pressedKeyboardNotes, setPressedKeyboardNotes] = useState<number[]>([]);
  const [activeLiveFx, setActiveLiveFx] = useState<Record<string, boolean>>({});
  const [liveFxControls, setLiveFxControls] = useState<LiveFxControls>({
    speed: 1,
    volume: 1.2,
    fadeIn: 0.04,
    fadeOut: 0.25,
  });
  const pressedKeyboardKeysRef = useRef<Set<number>>(new Set());
  const liveFxTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const liveFxControlsRef = useRef(liveFxControls);
  const recordStartTimeRef = useRef<number>(0);
  const showControlRef = useRef<ReturnType<typeof createShowControlClient> | null>(null);
  const showControlClientIdRef = useRef(`dj-music-editor-${crypto.randomUUID().slice(0, 8)}`);
  const showControlCommandRef = useRef<(command: ControlCommand) => void>(() => undefined);
  const [showControlStatus, setShowControlStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const activeTabRef = useRef(activeTab);
  const activeStyleRef = useRef(activeStyle);
  const tabsRef = useRef(tabs);
  const selectedStyleIdRef = useRef(selectedStyleId);
  const bpmRef = useRef(bpm);
  const showControlStatusRef = useRef(showControlStatus);
  const timelineStateRef = useRef({
    viewMode,
    isTimelinePlaying,
    timelinePlayhead,
    timelineDuration,
    timelineLoopRange,
  });

  useEffect(() => {
    activeTabRef.current = activeTab;
    activeStyleRef.current = activeStyle;
    tabsRef.current = tabs;
    selectedStyleIdRef.current = selectedStyleId;
    bpmRef.current = bpm;
  }, [activeTab, activeStyle, selectedStyleId, tabs, bpm]);

  useEffect(() => {
    showControlStatusRef.current = showControlStatus;
  }, [showControlStatus]);

  useEffect(() => {
    timelineStateRef.current = {
      viewMode,
      isTimelinePlaying,
      timelinePlayhead,
      timelineDuration,
      timelineLoopRange,
    };
  }, [viewMode, isTimelinePlaying, timelinePlayhead, timelineDuration, timelineLoopRange]);

  useEffect(() => {
    const handleStep = (e: any) => {
      const { projectId, step } = e.detail;
      setTabs(prev => prev.map(t => t.id === projectId ? { ...t, activeStep: step } : t));
    };
    const handleProjectStart = (e: any) => {
      const { projectId, step } = e.detail;
      setPendingPlayIds(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
      setTabs(prev => prev.map(t => t.id === projectId ? { ...t, isPlaying: true, activeStep: step } : t));
    };
    window.addEventListener('step', handleStep);
    window.addEventListener('project-start', handleProjectStart);
    return () => {
      window.removeEventListener('step', handleStep);
      window.removeEventListener('project-start', handleProjectStart);
    };
  }, []);

  useEffect(() => {
    const initialTab = tabs[0];
    const engine = engineManager.getProject(initialTab.id);
    engine.setSlots(initialTab.slots);
    engine.setMutedSlots(initialTab.mutedSlots);
    initialTab.fxSlots.forEach((fx, index) => engine.setFxParams(index, fx));
    engine.setMasterFxParams(initialTab.masterFx);
  }, []);

  useEffect(() => {
    setSaveStatus('idle');
  }, [tabs, selectedStyleId]);

  useEffect(() => {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
  }, [colorMode]);

  useEffect(() => {
    if (!isKeyboardVisible) return;

    const handleKeydown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const liveFx = LIVE_FX_PRESETS.find((preset) => preset.key === key);
      if (liveFx) {
        e.preventDefault();
        triggerLiveFx(liveFx);
        return;
      }

      const index = KEYBOARD_PHYSICAL_KEYS.indexOf(key);
      if (index !== -1) {
        e.preventDefault();
        const note = FLAT_KEYBOARD_NOTES[index];
        if (!pressedKeyboardKeysRef.current.has(note)) {
          pressedKeyboardKeysRef.current.add(note);
          setPressedKeyboardNotes(Array.from(pressedKeyboardKeysRef.current));
          handleKeyboardKeyPress(note);
        }
      }
    };

    const handleKeyup = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const index = KEYBOARD_PHYSICAL_KEYS.indexOf(key);
      if (index !== -1) {
        const note = FLAT_KEYBOARD_NOTES[index];
        if (pressedKeyboardKeysRef.current.delete(note)) {
          setPressedKeyboardNotes(Array.from(pressedKeyboardKeysRef.current));
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('keyup', handleKeyup);
      pressedKeyboardKeysRef.current.clear();
      setPressedKeyboardNotes([]);
    };
  }, [isKeyboardVisible, isRecordingKeyboard]);

  useEffect(() => {
    return () => {
      Object.values(liveFxTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    liveFxControlsRef.current = liveFxControls;
  }, [liveFxControls]);

  const syncProjectEngine = (tab: TabData) => {
    const engine = engineManager.getProject(tab.id);
    engine.setStyle(tab.styleId);
    engine.setSlots(tab.slots);
    engine.setMutedSlots(tab.mutedSlots);
    tab.fxSlots.forEach((fx, index) => engine.setFxParams(index, fx));
    engine.setMasterFxParams(tab.masterFx);
  };

  const persistWorkbench = (nextTabs = tabs, styleId = selectedStyleId) => {
    const payload = {
      styleId,
      tabs: nextTabs.map((tab) => ({
        ...tab,
        slotIds: tab.slots.map((slot) => slot?.id ?? null),
        slots: undefined,
        isPlaying: false,
        activeStep: 0,
      })),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setSaveStatus('saved');
  };

  const loadWorkbench = () => {
    const saved = hydrateSavedTabs();
    if (!saved) return;
    setTabs(saved.tabs);
    setSelectedStyleId(saved.styleId);
    setActiveTabId(saved.tabs[0].id);
    saved.tabs.forEach(syncProjectEngine);
    setSaveStatus('loaded');
  };

  const applyStylePreset = (styleId: string, tabId = activeTabId) => {
    const preset = STYLE_PRESETS.find((style) => style.id === styleId) ?? STYLE_PRESETS[0];
    const targetTab = tabs.find(tab => tab.id === tabId) ?? activeTab;
    const styledTab = createStyleTab(preset, targetTab.id, targetTab.styleId);
    const nextTab = {
      ...styledTab,
      name: preset.name,
      isPlaying: targetTab.isPlaying,
      activeStep: targetTab.activeStep,
    };
    setSelectedStyleId(styleId);
    setTabs(prev => prev.map(t => t.id === targetTab.id ? nextTab : t));
    syncProjectEngine(nextTab);
  };

  const shuffleActiveTab = () => {
    const pick = (category: string) => {
      const pool = AVAILABLE_SOUNDS.filter(sound => sound.category === category);
      return pool[Math.floor(Math.random() * pool.length)] ?? null;
    };
    const pickRareTexture = () => {
      const openExtraPools = extraCategories
        .filter(category => openExtraCategories[category.id])
        .flatMap(category => AVAILABLE_SOUNDS.filter(sound => sound.category === category.id));
      if (isExtraLibraryOpen && openExtraPools.length > 0 && Math.random() < 0.08) {
        return openExtraPools[Math.floor(Math.random() * openExtraPools.length)] ?? null;
      }
      return pick('experimental');
    };
    const nextSlots = [
      pick('beat'),
      pick('effect'),
      pick('bass'),
      pick('melody'),
      pick('theme'),
      pick('effect'),
      pickRareTexture(),
    ];
    const nextFx = activeStyle.fxSlots.map((fx) => makeFx({
      ...fx,
      volume: Math.max(22, Math.min(100, fx.volume + Math.round(Math.random() * 16 - 8))),
      panSwing: Math.max(0, Math.min(55, fx.panSwing + Math.round(Math.random() * 18))),
      delay: Math.max(0, Math.min(48, fx.delay + Math.round(Math.random() * 12 - 3))),
    }));
    const nextTab = {
      ...activeTab,
      name: `${activeStyle.name} Sketch`,
      slots: nextSlots,
      fxSlots: nextFx,
      masterFx: activeStyle.masterFx,
    };
    setTabs(prev => prev.map(t => t.id === activeTab.id ? nextTab : t));
    syncProjectEngine(nextTab);
  };

  const reverseActiveTab = () => {
    const reversedSlots = activeTab.slots.map(slot => {
      if (!slot) return null;
      return {
        ...slot,
        pattern: [...slot.pattern].reverse(),
      };
    });
    const nextTab = {
      ...activeTab,
      slots: reversedSlots,
    };
    setTabs(prev => prev.map(t => t.id === activeTab.id ? nextTab : t));
    syncProjectEngine(nextTab);
  };

  const resetWorkbench = () => {
    engineManager.stopAllProjects();
    setPendingPlayIds(new Set());
    const fresh = createCodexSongTab();
    setTabs([fresh]);
    setActiveTabId(fresh.id);
    setSelectedStyleId(STYLE_PRESETS[0].id);
    syncProjectEngine(fresh);
    window.localStorage.removeItem(STORAGE_KEY);
    setSaveStatus('idle');
  };

  const addNewTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab: TabData = {
      ...createStyleTab(activeStyle, newId),
      name: `${activeStyle.name} ${tabs.length + 1}`,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    syncProjectEngine(newTab);
  };

  const deleteTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    engineManager.stopProject(id);
    setPendingPlayIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (tabs.length === 1) {
      const fresh = createCodexSongTab();
      setTabs([fresh]);
      setActiveTabId(fresh.id);
      syncProjectEngine(fresh);
      return;
    }

    const tabIndex = tabs.findIndex(tab => tab.id === id);
    const nextTabs = tabs.filter(tab => tab.id !== id);
    const fallbackTab = nextTabs[Math.max(0, Math.min(tabIndex, nextTabs.length - 1))];
    setTabs(nextTabs);
    if (activeTabId === id && fallbackTab) {
      setActiveTabId(fallbackTab.id);
    }
  };

  const togglePlayTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    const engine = engineManager.getProject(id);
    const isPending = pendingPlayIds.has(id);
    engine.setStyle(tab.styleId);
    
    if (!tab.isPlaying && !isPending) {
      const startMode = engineManager.startProject(id);
      recordArrangementStart(tab);
      if (startMode === 'started') {
        setTabs(prev => prev.map(t => t.id === id ? { ...t, isPlaying: true, activeStep: 0 } : t));
      } else {
        setPendingPlayIds(prev => new Set(prev).add(id));
      }
    } else {
      recordArrangementStop(id);
      engineManager.stopProject(id);
      setPendingPlayIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setTabs(prev => prev.map(t => t.id === id ? { ...t, isPlaying: false } : t));
    }
  };

  const handleModuleMouseEnter = (index: number) => {
    if (activeTab.slots[index]) {
      clearTimeout(fxTimeoutRef.current);
      clearTimeout(tabFxTimeoutRef.current);
      setHoveredTabFxId(null);
      setHoveredFxSlot(index);
    }
  };

  const handleModuleMouseLeave = () => {
    fxTimeoutRef.current = setTimeout(() => setHoveredFxSlot(null), 300);
  };

  const handleTabMouseEnter = (id: string) => {
    clearTimeout(tabFxTimeoutRef.current);
    clearTimeout(fxTimeoutRef.current);
    setHoveredFxSlot(null);
    setHoveredTabFxId(id);
  };

  const handleTabMouseLeave = () => {
    tabFxTimeoutRef.current = setTimeout(() => setHoveredTabFxId(null), 300);
  };

  const handleFxChange = (key: keyof FxParams, value: number) => {
    if (hoveredFxSlot === null) return;
    
    const newFx = [...activeTab.fxSlots];
    newFx[hoveredFxSlot] = { ...newFx[hoveredFxSlot], [key]: value };
    
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, fxSlots: newFx } : t));
    engineManager.getProject(activeTab.id).setFxParams(hoveredFxSlot, newFx[hoveredFxSlot]);
  };

  const handleMasterFxChange = (key: keyof FxParams, value: number) => {
    if (!hoveredTabFxId) return;
    
    setTabs(prev => prev.map(t => {
      if (t.id === hoveredTabFxId) {
        const newFx = { ...t.masterFx, [key]: value };
        engineManager.getProject(hoveredTabFxId).setMasterFxParams(newFx);
        return { ...t, masterFx: newFx };
      }
      return t;
    }));
  };

  const handleResetFx = () => {
    if (hoveredFxSlot === null) return;
    const resetValues = defaultFx();
    const newFx = [...activeTab.fxSlots];
    newFx[hoveredFxSlot] = resetValues;
    
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, fxSlots: newFx } : t));
    engineManager.getProject(activeTab.id).setFxParams(hoveredFxSlot, resetValues);
  };

  const handleResetMasterFx = () => {
    if (!hoveredTabFxId) return;
    const resetValues = defaultFx();
    
    setTabs(prev => prev.map(t => {
      if (t.id === hoveredTabFxId) {
        engineManager.getProject(hoveredTabFxId).setMasterFxParams(resetValues);
        return { ...t, masterFx: resetValues };
      }
      return t;
    }));
  };

  const handleStyleChange = (styleId: AudioStyleId) => {
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, styleId } : t));
    engineManager.getProject(activeTab.id).setStyle(styleId);
  };

  const recordArrangementStart = (tab: TabData) => {
    if (!isGlobalRecording || !globalRecordStartedAtRef.current) return;
    const now = Date.now();
    const startMs = now - globalRecordStartedAtRef.current;
    setArrangementEvents(prev => [
      ...prev,
      {
        id: `evt-${now}-${tab.id}`,
        tabId: tab.id,
        tabName: tab.name,
        startMs,
        tab: cloneTabForRecording(tab),
      },
    ]);
  };

  const recordArrangementStop = (tabId: string) => {
    if (!isGlobalRecording || !globalRecordStartedAtRef.current) return;
    const nowMs = Date.now() - globalRecordStartedAtRef.current;
    setArrangementEvents(prev => prev.map(event => (
      event.tabId === tabId && event.durationMs === undefined
        ? { ...event, durationMs: Math.max(350, nowMs - event.startMs) }
        : event
    )));
  };

  const resolveCommandTabId = (command: ControlCommand) => {
    if (typeof command.value === 'object' && command.value && 'tabId' in command.value) {
      const tabId = String((command.value as { tabId?: unknown }).tabId);
      if (tabs.some(tab => tab.id === tabId)) return tabId;
    }
    if (typeof command.target === 'string' && tabs.some(tab => tab.id === command.target)) return command.target;
    return activeTabId;
  };

  const resolveCommandSlotIndex = (command: ControlCommand) => {
    const value = command.value;
    if (typeof value === 'object' && value && 'slotIndex' in value) {
      const slotIndex = Number((value as { slotIndex?: unknown }).slotIndex);
      if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < 7) return slotIndex;
    }

    const targetMatch = typeof command.target === 'string' ? command.target.match(/^slot[-:](\d+)$/i) : null;
    if (!targetMatch) return null;
    const parsed = Number(targetMatch[1]);
    if (!Number.isInteger(parsed)) return null;
    if (parsed >= 1 && parsed <= 7) return parsed - 1;
    if (parsed >= 0 && parsed < 7) return parsed;
    return null;
  };

  const setMutedSlotsForControl = (tabId: string, muted: boolean, slotIndex: number | null) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id !== tabId) return tab;
      const mutedSlots = [...tab.mutedSlots];
      if (slotIndex === null) {
        mutedSlots.fill(muted);
      } else {
        mutedSlots[slotIndex] = muted;
      }
      engineManager.getProject(tab.id).setMutedSlots(mutedSlots);
      return { ...tab, mutedSlots };
    }));
  };

  const startTabFromControl = (id = activeTabId) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab || tab.isPlaying || pendingPlayIds.has(id)) return;
    const engine = engineManager.getProject(id);
    engine.setStyle(tab.styleId);
    const startMode = engineManager.startProject(id);
    recordArrangementStart(tab);
    if (startMode === 'started') {
      setTabs(prev => prev.map(t => t.id === id ? { ...t, isPlaying: true, activeStep: 0 } : t));
    } else {
      setPendingPlayIds(prev => new Set(prev).add(id));
    }
  };

  const stopTabFromControl = (id = activeTabId) => {
    recordArrangementStop(id);
    engineManager.stopProject(id);
    setPendingPlayIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setTabs(prev => prev.map(t => t.id === id ? { ...t, isPlaying: false } : t));
  };

  const applyShowControlCommand = (command: ControlCommand) => {
    if (command.module && command.module !== 'audio' && command.module !== 'show') return;
    const value = command.value;
    const targetTabId = resolveCommandTabId(command);

    if (command.command === 'play') {
      startTabFromControl(targetTabId);
    } else if (command.command === 'pause' || command.command === 'stop') {
      stopTabFromControl(targetTabId);
    } else if (command.command === 'reset') {
      resetWorkbench();
    } else if (command.command === 'setPreset' && typeof value === 'string') {
      const preset = STYLE_PRESETS.find(style => style.id === value || style.name === value);
      if (preset) applyStylePreset(preset.id, targetTabId);
    } else if (command.command === 'setActiveTab' && typeof value === 'string' && tabs.some(tab => tab.id === value)) {
      setActiveTabId(value);
    } else if (command.command === 'setBpm') {
      const nextBpm = typeof value === 'number'
        ? value
        : typeof value === 'object' && value && 'bpm' in value
          ? Number((value as { bpm?: unknown }).bpm)
          : Number(value);
      if (Number.isFinite(nextBpm)) {
        const normalizedBpm = Math.max(40, Math.min(240, Math.round(nextBpm)));
        engineManager.bpm = normalizedBpm;
        setBpm(normalizedBpm);
      }
    } else if (command.command === 'setMute') {
      const muted = typeof value === 'boolean'
        ? value
        : typeof value === 'object' && value && 'muted' in value
          ? Boolean((value as { muted?: unknown }).muted)
          : true;
      setMutedSlotsForControl(targetTabId, muted, resolveCommandSlotIndex(command));
    } else if (command.command === 'setMasterLevel' && typeof value === 'number') {
      const volume = Math.max(0, Math.min(100, Math.round(value * 100)));
      setTabs(prev => prev.map(tab => {
        if (tab.id !== targetTabId) return tab;
        const masterFx = { ...tab.masterFx, volume };
        engineManager.getProject(tab.id).setMasterFxParams(masterFx);
        return { ...tab, masterFx };
      }));
    }
  };

  showControlCommandRef.current = applyShowControlCommand;

  useEffect(() => {
    showControlRef.current = createShowControlClient({
      module: 'audio',
      clientId: showControlClientIdRef.current,
      role: 'dj',
      capabilities: ['module.statePatch', 'mixer.audioFrame', 'control.command', 'audio.transport', 'audio.presets'],
      onCommand: (command) => showControlCommandRef.current(command),
      onStatus: setShowControlStatus,
    });

    return () => showControlRef.current?.close();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const client = showControlRef.current;
      const tab = activeTabRef.current;
      const style = activeStyleRef.current;
      if (!client || !tab || !style) return;

      const timeline = timelineStateRef.current;
      const patch = {
        status: 'online',
        projectName: 'Music Editor',
        transport: tab.isPlaying ? 'playing' : timeline.isTimelinePlaying ? 'playing' : 'stopped',
        bpm: bpmRef.current,
        masterLevel: clampUnit((tab.masterFx.volume ?? 0) / 100),
        activeTab: tab.id,
        activePreset: style.name,
        activePresetId: selectedStyleIdRef.current,
        activeStep: tab.activeStep,
        activeSourceId: tab.id,
        slots: tab.slots.map((slot, index) => ({
          id: slot?.id || `empty-${index}`,
          name: slot?.name || 'Empty',
          category: slot?.category || 'empty',
          muted: Boolean(tab.mutedSlots[index]),
          level: tab.mutedSlots[index] ? 0 : clampUnit((tab.fxSlots[index]?.volume ?? 0) / 100),
        })),
        fx: {
          compressor: tab.masterFx.compressor,
          reverb: tab.masterFx.reverb,
          delay: tab.masterFx.delay,
        },
        arrangementSummary: {
          tabCount: tabsRef.current.length,
          styleId: tab.styleId,
          presetId: selectedStyleIdRef.current,
        },
        timeline: {
          viewMode: timeline.viewMode,
          isPlaying: timeline.isTimelinePlaying,
          playhead: timeline.timelinePlayhead,
          duration: timeline.timelineDuration,
          loopRange: timeline.timelineLoopRange,
        },
      };
      client.publishState(patch);
    }, 500);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (showControlStatusRef.current !== 'connected') return;
      const client = showControlRef.current;
      const tab = activeTabRef.current;
      const style = activeStyleRef.current;
      if (!client || !tab || !style) return;

      client.publishAudioFrame(
        buildMixerTelemetry(tab, style, bpmRef.current, tabsRef.current.length),
      );
    }, 33);

    return () => window.clearInterval(timer);
  }, []);

  const clearGlobalRecordTimer = () => {
    if (!globalRecordTimerRef.current) return;
    clearTimeout(globalRecordTimerRef.current);
    globalRecordTimerRef.current = null;
  };

  const setGlobalRecordState = (state: GlobalRecordingState) => {
    globalRecordingStateRef.current = state;
    setGlobalRecordingState(state);
    setIsGlobalRecording(state === 'recording' || state === 'stopping');
  };

  const startGlobalRecording = () => {
    if (globalRecorderRef.current?.state === 'recording') return;
    try {
      engineManager.init();
      const stream = engineManager.startCaptureStream();
      const mimeType = getInternalRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      globalRecordChunksRef.current = [];
      globalRecordStartedAtRef.current = Date.now();
      setArrangementEvents([]);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) globalRecordChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        engineManager.stopCaptureStream();
        stream.getTracks().forEach(track => track.stop());
        globalRecorderRef.current = null;
        const blob = new Blob(globalRecordChunksRef.current, { type: mimeType || 'audio/webm' });
        globalRecordChunksRef.current = [];
        globalRecordStartedAtRef.current = 0;
        if (!blob.size) {
          setGlobalRecordState('idle');
          return;
        }

        try {
          engineManager.init();
          if (!engineManager.ctx) return;
          const arrayBuffer = await blob.arrayBuffer();
          const capturedBuffer = await engineManager.ctx.decodeAudioData(arrayBuffer);
          const soundIndex = recordedSounds.filter(sound => sound.id.startsWith('arr-')).length + 1;
          const newSound: SoundDef = {
            id: `arr-${Date.now()}`,
            name: `内录原声 ${soundIndex}`,
            category: 'custom',
            color: CLIP_COLOR_CLASSES[recordedSounds.length % CLIP_COLOR_CLASSES.length],
            pattern: [{ note: 1 }, ...new Array(15).fill({})],
            buffer: capturedBuffer,
            loopMode: 'full',
            playMode: 'buffer',
          };

          setRecordedSounds(prev => [...prev, newSound]);
          setTimelineClips(prev => [
            ...prev,
            {
              id: `clip-${Date.now()}`,
              soundId: newSound.id,
              track: Math.min(prev.length % TIMELINE_TRACKS, TIMELINE_TRACKS - 1),
              start: Math.min(2 + prev.length * 1.25, Math.max(0, timelineDuration - Math.min(8, capturedBuffer.duration))),
              duration: Math.min(timelineDuration, Math.max(0.5, capturedBuffer.duration)),
              trimStart: 0,
            },
          ]);
          setViewMode('timeline');
        } catch (err) {
          console.error('Global recording decode failed', err);
          alert('录制完成，但音频生成失败，请再试一次。');
        } finally {
          setGlobalRecordState('idle');
        }
      };

      recorder.start();
      globalRecorderRef.current = recorder;
      setGlobalRecordState('recording');
    } catch (err) {
      engineManager.stopCaptureStream();
      globalRecorderRef.current = null;
      setGlobalRecordState('idle');
      console.error('Global recording failed', err);
      alert('无法开始全局录制，请先点击播放一个标签后再试。');
    }
  };

  const stopGlobalRecording = () => {
    clearGlobalRecordTimer();
    if (globalRecorderRef.current?.state === 'recording') {
      globalRecorderRef.current.requestData();
      globalRecorderRef.current.stop();
    } else {
      engineManager.stopCaptureStream();
      globalRecorderRef.current = null;
      setGlobalRecordState('idle');
    }
  };

  const handleGlobalRecordingToggle = () => {
    if (globalRecordingStateRef.current === 'waiting') {
      clearGlobalRecordTimer();
      setGlobalRecordState('idle');
      return;
    }

    if (globalRecordingStateRef.current === 'recording') {
      clearGlobalRecordTimer();
      setGlobalRecordState('stopping');
      return;
    }

    if (globalRecordingStateRef.current === 'stopping') return;

    engineManager.init();
    clearGlobalRecordTimer();
    setGlobalRecordState('waiting');
  };

  startGlobalRecordingRef.current = startGlobalRecording;
  stopGlobalRecordingRef.current = stopGlobalRecording;

  useEffect(() => {
    const handleBpmLoopStart = (event: Event) => {
      const detail = (event as CustomEvent<{ scheduledTime?: number; currentTime?: number }>).detail ?? {};
      const scheduledTime = detail.scheduledTime ?? engineManager.ctx?.currentTime ?? 0;
      const currentTime = detail.currentTime ?? engineManager.ctx?.currentTime ?? scheduledTime;
      const delayMs = Math.max(0, (scheduledTime - currentTime) * 1000);

      if (globalRecordingStateRef.current === 'waiting') {
        clearGlobalRecordTimer();
        globalRecordTimerRef.current = setTimeout(() => {
          globalRecordTimerRef.current = null;
          if (globalRecordingStateRef.current === 'waiting') {
            startGlobalRecordingRef.current();
          }
        }, delayMs);
      }

      if (globalRecordingStateRef.current === 'stopping') {
        clearGlobalRecordTimer();
        globalRecordTimerRef.current = setTimeout(() => {
          globalRecordTimerRef.current = null;
          if (globalRecordingStateRef.current === 'stopping') {
            stopGlobalRecordingRef.current();
          }
        }, delayMs);
      }
    };

    window.addEventListener('bpm-loop-start', handleBpmLoopStart);
    return () => {
      window.removeEventListener('bpm-loop-start', handleBpmLoopStart);
      clearGlobalRecordTimer();
    };
  }, []);

  interface SerializableSoundDef extends Omit<SoundDef, 'buffer'> {
    bufferBase64?: string;
    sampleRate?: number;
    numberOfChannels?: number;
  }

  interface SerializedTabData {
    id: string;
    name: string;
    slots: (SerializableSoundDef | null)[];
    mutedSlots: boolean[];
    moduleFx: FxParams[];
    masterFx: FxParams;
    styleId: AudioStyleId;
    activeStep: number;
    isPlaying: boolean;
    fxSlots?: FxParams[]; // backward compatibility for older exports
  }

  interface MusicArrFile {
    version: '1.0';
    tabs: SerializedTabData[];
    recordedSounds: SerializableSoundDef[];
    timeline?: {
      duration: number;
      playhead: number;
      loopRange: {
        start: number;
        end: number;
      };
      clips: TimelineClip[];
      selectedClipId?: string | null;
    };
    userSettings: {
      activeTabId: string;
      keyboardInstrumentMode: string;
      isKeyboardVisible?: boolean;
    };
  }

  const encodeAudioBufferToWavBase64 = (buffer: AudioBuffer): string => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitsPerSample = 16;
    const blockAlign = numChannels * bitsPerSample / 8;
    const byteLength = 44 + buffer.length * blockAlign;
    const wav = new ArrayBuffer(byteLength);
    const view = new DataView(wav);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * blockAlign, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, buffer.length * blockAlign, true);

    const offset = 44;
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      let idx = offset + channel * 2;
      for (let i = 0; i < buffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(idx, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        idx += blockAlign;
      }
    }

    const bytes = new Uint8Array(wav);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
  };

  const decodeBase64ToAudioBuffer = async (base64: string): Promise<AudioBuffer> => {
    engineManager.init();
    if (!engineManager.ctx) throw new Error('Unable to initialize audio context for import');

    const binaryString = atob(base64);
    const buffer = new ArrayBuffer(binaryString.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binaryString.length; i++) {
      view[i] = binaryString.charCodeAt(i);
    }
    return await engineManager.ctx.decodeAudioData(buffer);
  };

  const serializeSoundDef = async (sound: SoundDef): Promise<SerializableSoundDef> => {
    const serialized: SerializableSoundDef = {
      id: sound.id,
      name: sound.name,
      category: sound.category,
      color: sound.color,
      pattern: sound.pattern,
      loopMode: sound.loopMode,
      playMode: sound.playMode,
    };

    if (sound.buffer) {
      serialized.bufferBase64 = encodeAudioBufferToWavBase64(sound.buffer);
      serialized.sampleRate = sound.buffer.sampleRate;
      serialized.numberOfChannels = sound.buffer.numberOfChannels;
    }

    return serialized;
  };

  const deserializeSoundDef = async (raw: SerializableSoundDef): Promise<SoundDef> => {
    const builtIn = AVAILABLE_SOUNDS.find((item) => item.id === raw.id && !raw.bufferBase64);
    if (builtIn) {
      return builtIn;
    }

    const result: SoundDef = {
      id: raw.id,
      name: raw.name,
      category: raw.category,
      color: raw.color,
      pattern: raw.pattern,
      loopMode: raw.loopMode,
      playMode: raw.playMode,
    };

    if (raw.bufferBase64) {
      result.buffer = await decodeBase64ToAudioBuffer(raw.bufferBase64);
    }

    return result;
  };

  const createMusicarrPayload = async (): Promise<MusicArrFile> => {
    const tabsPayload = await Promise.all(tabs.map(async (tab) => ({
      id: tab.id,
      name: tab.name,
      slots: await Promise.all(tab.slots.map((slot) => slot ? serializeSoundDef(slot) : null)),
      mutedSlots: tab.mutedSlots,
      moduleFx: tab.fxSlots,
      masterFx: tab.masterFx,
      styleId: tab.styleId,
      activeStep: tab.activeStep,
      isPlaying: tab.isPlaying,
    })));

    const recordedPayload = await Promise.all(recordedSounds.map(serializeSoundDef));

    return {
      version: '1.0',
      tabs: tabsPayload,
      recordedSounds: recordedPayload,
      timeline: {
        duration: timelineDuration,
        playhead: timelinePlayheadRef.current,
        loopRange: timelineLoopRange,
        clips: timelineClips,
        selectedClipId: selectedTimelineClipId,
      },
      userSettings: {
        activeTabId,
        keyboardInstrumentMode,
        isKeyboardVisible,
      },
    };
  };

  const handleExportArrangement = async () => {
    try {
      const payload = await createMusicarrPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `arrangement-${Date.now()}.musicarr`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      alert('导出失败，请重试。');
    }
  };

  const handleImportArrangement = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.musicarr')) {
      alert('请选择 .musicarr 文件进行导入。');
      event.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text) as MusicArrFile;
      if (!data || !Array.isArray(data.tabs)) {
        throw new Error('无效的文件格式');
      }

      engineManager.init();
      engineManager.stopAllProjects();
      setPendingPlayIds(new Set());
      const importedRecordedSounds = await Promise.all((data.recordedSounds || []).map(deserializeSoundDef));
      const importedTabs = await Promise.all(data.tabs.map(async (tab) => ({
        ...tab,
        slots: await Promise.all(tab.slots.map((slot) => slot ? deserializeSoundDef(slot) : null)),
        fxSlots: tab.moduleFx ?? tab.fxSlots ?? new Array(7).fill(null).map(defaultFx),
        isPlaying: false,
        activeStep: 0,
      })));

      setRecordedSounds(importedRecordedSounds);
      setTabs(importedTabs);
      setActiveTabId(data.userSettings?.activeTabId || importedTabs[0]?.id || 'tab-1');
      setKeyboardInstrumentMode(data.userSettings?.keyboardInstrumentMode || KEYBOARD_INSTRUMENT_MODES[0].id);
      setIsKeyboardVisible(Boolean(data.userSettings?.isKeyboardVisible));
      if (data.timeline) {
        const nextDuration = Math.max(1, Math.min(600, Number(data.timeline.duration) || DEFAULT_TIMELINE_SECONDS));
        const nextLoopStart = Math.max(0, Math.min(data.timeline.loopRange?.start ?? 0, nextDuration - 0.25));
        const nextLoopEnd = Math.max(nextLoopStart + 0.25, Math.min(data.timeline.loopRange?.end ?? Math.min(8, nextDuration), nextDuration));
        const nextPlayhead = Math.max(0, Math.min(data.timeline.playhead ?? nextLoopStart, nextDuration));
        const nextClips = (data.timeline.clips || []).map((clip) => {
          const duration = Math.max(0.5, Math.min(clip.duration, nextDuration));
          return {
            ...clip,
            track: Math.max(0, Math.min(TIMELINE_TRACKS - 1, clip.track)),
            start: Math.max(0, Math.min(clip.start, Math.max(0, nextDuration - duration))),
            duration,
            trimStart: Math.max(0, clip.trimStart),
          };
        });
        setTimelineDuration(nextDuration);
        setTimelineLoopRange({ start: nextLoopStart, end: nextLoopEnd });
        setTimelinePlayhead(nextPlayhead);
        timelinePlayheadRef.current = nextPlayhead;
        timelineOffsetRef.current = nextPlayhead;
        setTimelineClips(nextClips);
        setSelectedTimelineClipId(data.timeline.selectedClipId ?? null);
      } else {
        setTimelineClips([]);
        setSelectedTimelineClipId(null);
      }

      importedTabs.forEach((tab) => {
        const engine = engineManager.getProject(tab.id);
        engine.setStyle(tab.styleId);
        engine.setSlots(tab.slots);
        engine.setMutedSlots(tab.mutedSlots);
        (tab.fxSlots || tab.moduleFx || []).forEach((fx, index) => engine.setFxParams(index, fx));
        engine.setMasterFxParams(tab.masterFx);
      });
    } catch (err) {
      console.error('Import failed', err);
      alert('导入失败，请检查文件格式。');
    }

    event.target.value = '';
  };

  const toggleMute = (index: number) => {
    if (!activeTab.slots[index]) return;
    const newMuted = [...activeTab.mutedSlots];
    newMuted[index] = !newMuted[index];
    
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, mutedSlots: newMuted } : t));
    engineManager.getProject(activeTab.id).setMutedSlots(newMuted);
  };

  const handleDragStart = (e: React.DragEvent, item: SoundDef) => {
    const cleanItem = { ...item, buffer: undefined }; 
    e.dataTransfer.setData('application/json', JSON.stringify(cleanItem));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    try {
      const data = e.dataTransfer.getData('application/json');
      const itemData = JSON.parse(data) as SoundDef;
      
      let item = AVAILABLE_SOUNDS.find(s => s.id === itemData.id) || recordedSounds.find(s => s.id === itemData.id);
      
      if (!item) return;

      const newSlots = [...activeTab.slots];
      newSlots[slotIndex] = item;
      
      setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, slots: newSlots } : t));
      const engine = engineManager.getProject(activeTab.id);
      engine.setStyle(activeTab.styleId);
      engine.setSlots(newSlots);
      
      if (!activeTab.isPlaying) {
         const startMode = engineManager.startProject(activeTab.id);
         if (startMode === 'started') {
           setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, isPlaying: true, activeStep: 0 } : t));
         } else {
           setPendingPlayIds(prev => new Set(prev).add(activeTab.id));
         }
      }
    } catch (err) {
      console.error('Drop error', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const getSoundById = (id: string) => recordedSounds.find(sound => sound.id === id) || AVAILABLE_SOUNDS.find(sound => sound.id === id);

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

  const handleTimelineDrop = (e: React.DragEvent, track: number) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const start = snapTime((e.clientX - rect.left) / PIXELS_PER_SECOND, timelineSnapCandidates());

    try {
      const data = e.dataTransfer.getData('application/json');
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

  const handleTimelineClipDragStart = (e: React.DragEvent, clipId: string) => {
    e.preventDefault();
    e.dataTransfer.setData('application/x-timeline-clip', clipId);
    e.dataTransfer.effectAllowed = 'move';
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

  const handleTimelineSurfacePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const wasPlaying = isTimelinePlaying;
    if (wasPlaying) stopTimelinePlayback(false);
    seekTimelinePlayhead(timeFromTimelinePointer(event.clientX));
    if (wasPlaying) requestAnimationFrame(playTimeline);
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
  }, [timelineClips, recordedSounds]);

  const deleteRecordedSound = (soundId: string) => {
    if (isTimelinePlaying) stopTimelinePlayback(false);
    setRecordedSounds(prev => prev.filter(sound => sound.id !== soundId));
    setTimelineClips(prev => prev.filter(clip => clip.soundId !== soundId));
    setSelectedTimelineClipId(prev => {
      const selectedClip = timelineClips.find(clip => clip.id === prev);
      return selectedClip?.soundId === soundId ? null : prev;
    });
  };

  const clearRecordedSounds = () => {
    if (recordedSounds.length === 0) return;
    if (isTimelinePlaying) stopTimelinePlayback(false);
    const soundIds = new Set(recordedSounds.map(sound => sound.id));
    setRecordedSounds([]);
    setTimelineClips(prev => prev.filter(clip => !soundIds.has(clip.soundId)));
    setSelectedTimelineClipId(null);
  };

  const renderTimelinePage = () => (
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
              onDragStart={(e) => handleDragStart(e, sound)}
              className={cn("relative rounded-lg border p-3 cursor-grab active:cursor-grabbing", isDayMode ? "bg-white border-slate-900/10 shadow-sm" : "bg-zinc-900/80 border-white/10")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={cn("truncate text-[11px] font-bold uppercase tracking-widest", isDayMode ? "text-slate-800" : "text-zinc-100")}>{sound.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", sound.color || CLIP_COLOR_CLASSES[index % CLIP_COLOR_CLASSES.length])}></span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRecordedSound(sound.id);
                    }}
                    onDragStart={(e) => e.preventDefault()}
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
                {[0.32, 0.68, 0.46, 0.88, 0.58, 0.76, 0.38, 0.66].map((height, i) => (
                  <span key={i} className={cn("flex-1 rounded-t", sound.color || "bg-emerald-500")} style={{ height: `${height * 100}%`, opacity: 0.35 + i * 0.04 }} />
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
            <button
              onClick={rewindTimeline}
              className={cn("flex h-10 w-10 items-center justify-center rounded-full border transition-colors", softButtonClass)}
              aria-label="Return playhead to start"
              title="Return playhead to start"
            >
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
              {isTimelinePlaying && (
                <span className="absolute -inset-1 rounded-full border border-emerald-400/25 border-t-emerald-100 animate-spin" />
              )}
              {isTimelinePlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            </button>
            <button
              onClick={jumpTimelineToEnd}
              className={cn("flex h-10 w-10 items-center justify-center rounded-full border transition-colors", softButtonClass)}
              aria-label="Jump playhead to end"
              title="Jump playhead to end"
            >
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
                style={{
                  left: 80 + timelineLoopRange.start * PIXELS_PER_SECOND,
                  width: Math.max(12, (timelineLoopRange.end - timelineLoopRange.start) * PIXELS_PER_SECOND),
                }}
              />
              <div
                className="absolute -top-8 z-40 h-8 rounded-t-lg border border-emerald-300/70 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.22)]"
                style={{
                  left: 80 + timelineLoopRange.start * PIXELS_PER_SECOND,
                  width: Math.max(28, (timelineLoopRange.end - timelineLoopRange.start) * PIXELS_PER_SECOND),
                }}
              >
                <button
                  type="button"
                  onPointerDown={(e) => beginTimelineTransportEdit(e, 'range-start')}
                  className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-tl-lg bg-emerald-200/70 hover:bg-white"
                  aria-label="Adjust loop range start"
                />
                <button
                  type="button"
                  onPointerDown={(e) => beginTimelineTransportEdit(e, 'range-move')}
                  className="absolute inset-x-3 top-0 h-full cursor-grab active:cursor-grabbing"
                  aria-label="Move loop range"
                >
                  <span className="flex h-full items-center justify-center text-[9px] font-black uppercase tracking-widest text-emerald-50">
                    {timelineLoopRange.start.toFixed(1)} - {timelineLoopRange.end.toFixed(1)}
                  </span>
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => beginTimelineTransportEdit(e, 'range-end')}
                  className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-tr-lg bg-emerald-200/70 hover:bg-white"
                  aria-label="Adjust loop range end"
                />
              </div>
              <div
                onPointerDown={(e) => beginTimelineTransportEdit(e, 'playhead')}
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
                    onDrop={(e) => handleTimelineDrop(e, track)}
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
                    {timelineClips.filter(clip => clip.track === track).map(clip => {
                      const sound = getSoundById(clip.soundId);
                      const selected = selectedTimelineClipId === clip.id;
                      return (
                        <div
                          key={clip.id}
                          draggable={false}
                          onPointerDown={(e) => beginTimelineEdit(e, clip, 'move')}
                          onClick={() => setSelectedTimelineClipId(clip.id)}
                          className={cn(
                            "absolute top-3 h-[68px] rounded-md border p-2 shadow-lg cursor-move overflow-hidden touch-none",
                            selected ? "border-white/80 ring-2 ring-emerald-400/60" : "border-white/20",
                            sound?.color || "bg-emerald-500"
                          )}
                          style={{ left: clip.start * PIXELS_PER_SECOND, width: Math.max(46, clip.duration * PIXELS_PER_SECOND) }}
                        >
                          <button
                            type="button"
                            onPointerDown={(e) => beginTimelineEdit(e, clip, 'trim-start')}
                            className="absolute left-0 top-0 z-20 h-full w-3 cursor-ew-resize bg-white/20 hover:bg-white/45"
                            aria-label="Trim clip start"
                          />
                          <button
                            type="button"
                            onPointerDown={(e) => beginTimelineEdit(e, clip, 'trim-end')}
                            className="absolute right-0 top-0 z-20 h-full w-3 cursor-ew-resize bg-white/20 hover:bg-white/45"
                            aria-label="Trim clip end"
                          />
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
          <button
            onClick={() => selectedTimelineClipId && duplicateTimelineClip(selectedTimelineClipId)}
            disabled={!selectedTimelineClipId}
            className={cn("flex h-9 items-center gap-2 rounded border px-3 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35", softButtonClass)}
          >
            <Copy size={12} />
            Copy
          </button>
          <button
            onClick={() => selectedTimelineClipId && cropTimelineClip(selectedTimelineClipId, 'left', 0.25)}
            disabled={!selectedTimelineClipId}
            className={cn("flex h-9 items-center gap-2 rounded border px-3 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35", softButtonClass)}
          >
            <Scissors size={12} />
            Trim In
          </button>
          <button
            onClick={() => selectedTimelineClipId && cropTimelineClip(selectedTimelineClipId, 'right', -0.25)}
            disabled={!selectedTimelineClipId}
            className={cn("flex h-9 items-center gap-2 rounded border px-3 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35", softButtonClass)}
          >
            <Scissors size={12} />
            Trim Out
          </button>
          <button
            onClick={() => selectedTimelineClipId && setTimelineClips(prev => prev.filter(clip => clip.id !== selectedTimelineClipId))}
            disabled={!selectedTimelineClipId}
            className="flex h-9 items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 text-[10px] font-bold uppercase tracking-widest text-red-300 disabled:opacity-35"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      </section>
    </main>
  );

  const handleClearSlot = (index: number) => {
    const newSlots = [...activeTab.slots];
    newSlots[index] = null;
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, slots: newSlots } : t));
    engineManager.getProject(activeTab.id).setSlots(newSlots);
  };

  const handleClearActiveTab = () => {
    const emptySlots = new Array(7).fill(null);
    const mutedSlots = new Array(7).fill(false);
    const fxSlots = new Array(7).fill(null).map(defaultFx);
    const nextTab = {
      ...activeTab,
      slots: emptySlots,
      mutedSlots,
      fxSlots,
    };
    setTabs(prev => prev.map(t => t.id === activeTab.id ? nextTab : t));
    syncProjectEngine(nextTab);
  };

  const toggleLoopMode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRecordedSounds(prev => prev.map(s => {
      if (s.id !== id) return s;
      const newMode = s.loopMode === 'fast' ? 'full' : 'fast';
      return {
        ...s,
        loopMode: newMode,
        pattern: newMode === 'fast' ? new Array(16).fill({ note: 1 }) : [{ note: 1 }, ...new Array(15).fill({})]
      };
    }));
    
    // Update active slots
    const newSlots = activeTab.slots.map(slot => {
      if (slot && slot.id === id) {
        const newMode = slot.loopMode === 'fast' ? 'full' : 'fast';
        return {
          ...slot,
          loopMode: newMode,
          pattern: newMode === 'fast' ? new Array(16).fill({ note: 1 }) : [{ note: 1 }, ...new Array(15).fill({})]
        };
      }
      return slot;
    });
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, slots: newSlots } : t));
    engineManager.getProject(activeTab.id).setSlots(newSlots);
  };

  // Recording & Upload Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = getInternalRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
        if (!audioBlob.size) return;

        const arrayBuffer = await audioBlob.arrayBuffer();
        
        engineManager.init();
        if (engineManager.ctx) {
          try {
            const micBuffer = await engineManager.ctx.decodeAudioData(arrayBuffer);
            
            const newSound: SoundDef = {
              id: `rec-${Date.now()}`,
              name: `Mic Voice ${recordedSounds.filter(s => s.id.startsWith('rec-')).length + 1}`,
              category: 'custom',
              color: 'bg-pink-500',
              pattern: [{ note: 1 }, ...new Array(15).fill({})],
              buffer: micBuffer,
              loopMode: 'full',
              playMode: 'buffer'
            };
            setRecordedSounds(prev => [...prev, newSound]);
            setViewMode('timeline');
          } catch (err) {
            console.error('Recording process error:', err);
            alert('麦克风录音生成失败，请再试一次。');
          }
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('无法启动麦克风录音，请检查浏览器麦克风权限。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      engineManager.init();
      if (engineManager.ctx) {
        const rawBuffer = await engineManager.ctx.decodeAudioData(arrayBuffer);
        const processedBuffer = await engineManager.processBuffer(rawBuffer);
        
        const newSound: SoundDef = {
          id: `upload-${Date.now()}`,
          name: file.name.substring(0, 10),
          category: 'custom',
          color: 'bg-teal-500',
          pattern: [{ note: 1 }, ...new Array(15).fill({})],
          buffer: processedBuffer,
          loopMode: 'full'
        };
        setRecordedSounds(prev => [...prev, newSound]);
      }
    } catch (err) {
      console.error('File upload error:', err);
    }
    event.target.value = '';
  };

  const createLiveNoise = (ctx: AudioContext, duration: number) => {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  };

  const playLiveFx = (preset: LiveFxPreset) => {
    engineManager.init();
    const ctx = engineManager.ctx;
    if (!ctx) return;

    const controls = liveFxControlsRef.current;
    const speed = Math.max(0.5, Math.min(2, controls.speed));
    const duration = preset.duration / speed;
    const scaleTime = (seconds: number) => seconds / speed;
    const fadeIn = Math.min(controls.fadeIn, Math.max(0.01, duration * 0.45));
    const fadeOut = Math.min(controls.fadeOut, Math.max(0.03, duration * 0.45));
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(controls.volume, now + fadeIn);
    out.gain.setValueAtTime(controls.volume, Math.max(now + fadeIn, now + duration - fadeOut));
    out.gain.linearRampToValueAtTime(0.0001, now + duration);
    out.connect(ctx.destination);

    if (preset.id === 'heartbeat') {
      [0, 0.31, 1.12, 1.43, 2.25, 2.56, 3.38, 3.69].forEach((offset, index) => {
        const t = now + scaleTime(offset);
        const firstBeat = index % 2 === 0;
        const body = ctx.createOscillator();
        const chest = ctx.createOscillator();
        const bodyGain = ctx.createGain();
        const chestGain = ctx.createGain();
        const noise = createLiveNoise(ctx, scaleTime(0.09));
        const noiseFilter = ctx.createBiquadFilter();
        const noiseGain = ctx.createGain();
        const lowShelf = ctx.createBiquadFilter();
        const pulseMix = ctx.createGain();

        body.type = 'sine';
        chest.type = 'triangle';
        body.frequency.setValueAtTime(firstBeat ? 54 : 46, t);
        body.frequency.exponentialRampToValueAtTime(firstBeat ? 31 : 28, t + scaleTime(firstBeat ? 0.18 : 0.15));
        chest.frequency.setValueAtTime(firstBeat ? 88 : 72, t);
        chest.frequency.exponentialRampToValueAtTime(firstBeat ? 42 : 36, t + scaleTime(firstBeat ? 0.13 : 0.11));

        bodyGain.gain.setValueAtTime(firstBeat ? 1.35 : 0.92, t);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, t + scaleTime(firstBeat ? 0.24 : 0.2));
        chestGain.gain.setValueAtTime(firstBeat ? 0.34 : 0.22, t);
        chestGain.gain.exponentialRampToValueAtTime(0.001, t + scaleTime(firstBeat ? 0.12 : 0.1));

        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(firstBeat ? 130 : 105, t);
        noiseFilter.Q.setValueAtTime(0.7, t);
        noiseGain.gain.setValueAtTime(firstBeat ? 0.16 : 0.1, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + scaleTime(0.06));

        lowShelf.type = 'lowshelf';
        lowShelf.frequency.setValueAtTime(95, t);
        lowShelf.gain.setValueAtTime(8, t);
        pulseMix.gain.setValueAtTime(1, t);

        body.connect(bodyGain);
        chest.connect(chestGain);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        bodyGain.connect(pulseMix);
        chestGain.connect(pulseMix);
        noiseGain.connect(pulseMix);
        pulseMix.connect(lowShelf);
        lowShelf.connect(out);

        body.start(t);
        chest.start(t);
        noise.start(t);
        body.stop(t + scaleTime(firstBeat ? 0.26 : 0.22));
        chest.stop(t + scaleTime(firstBeat ? 0.14 : 0.12));
      });
      return;
    }

    if (preset.id === 'atmosphere') {
      const noise = createLiveNoise(ctx, duration);
      const low = ctx.createBiquadFilter();
      const high = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      low.type = 'lowpass';
      low.frequency.setValueAtTime(520, now);
      low.frequency.linearRampToValueAtTime(900, now + duration * 0.55);
      high.type = 'highpass';
      high.frequency.setValueAtTime(90, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.42, now + scaleTime(0.5));
      gain.gain.setTargetAtTime(0.0001, now + duration - scaleTime(0.65), scaleTime(0.24));
      noise.connect(low);
      low.connect(high);
      high.connect(gain);
      gain.connect(out);
      noise.start(now);
      return;
    }

    if (preset.id === 'riser') {
      const noise = createLiveNoise(ctx, duration);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const tone = ctx.createOscillator();
      const toneGain = ctx.createGain();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(5, now);
      filter.frequency.setValueAtTime(240, now);
      filter.frequency.exponentialRampToValueAtTime(5200, now + duration);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.44, now + duration - scaleTime(0.35));
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      tone.type = 'sawtooth';
      tone.frequency.setValueAtTime(180, now);
      tone.frequency.exponentialRampToValueAtTime(1240, now + duration);
      toneGain.gain.setValueAtTime(0.001, now);
      toneGain.gain.linearRampToValueAtTime(0.1, now + duration - scaleTime(0.4));
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      tone.connect(toneGain);
      toneGain.connect(out);
      noise.start(now);
      tone.start(now);
      tone.stop(now + duration);
      return;
    }

    if (preset.id === 'impact') {
      const boom = ctx.createOscillator();
      const boomGain = ctx.createGain();
      const noise = createLiveNoise(ctx, scaleTime(0.45));
      const filter = ctx.createBiquadFilter();
      const crack = ctx.createGain();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(130, now);
      boom.frequency.exponentialRampToValueAtTime(32, now + scaleTime(0.75));
      boomGain.gain.setValueAtTime(1, now);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + scaleTime(1.1));
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1500, now);
      crack.gain.setValueAtTime(0.52, now);
      crack.gain.exponentialRampToValueAtTime(0.001, now + scaleTime(0.34));
      boom.connect(boomGain);
      boomGain.connect(out);
      noise.connect(filter);
      filter.connect(crack);
      crack.connect(out);
      boom.start(now);
      boom.stop(now + scaleTime(1.15));
      noise.start(now);
      return;
    }

    if (preset.id === 'stutter') {
      for (let i = 0; i < 9; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + scaleTime(i * 0.14);
        osc.type = i % 2 === 0 ? 'square' : 'sawtooth';
        osc.frequency.setValueAtTime(260 + i * 95, t);
        gain.gain.setValueAtTime(0.26, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + scaleTime(0.08));
        osc.connect(gain);
        gain.connect(out);
        osc.start(t);
        osc.stop(t + scaleTime(0.09));
      }
      return;
    }

    if (preset.id === 'air') {
      const noise = createLiveNoise(ctx, duration);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2800, now);
      filter.frequency.exponentialRampToValueAtTime(6200, now + duration * 0.45);
      filter.frequency.exponentialRampToValueAtTime(1600, now + duration);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + scaleTime(0.35));
      gain.gain.setTargetAtTime(0.0001, now + duration - scaleTime(0.5), scaleTime(0.18));
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      noise.start(now);
      return;
    }

    if (preset.id === 'alarm') {
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + scaleTime(i * 0.42);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(i % 2 === 0 ? 740 : 560, t);
        gain.gain.setValueAtTime(0.34, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + scaleTime(0.24));
        osc.connect(gain);
        gain.connect(out);
        osc.start(t);
        osc.stop(t + scaleTime(0.26));
      }
      return;
    }

    const delay = ctx.createDelay(0.35);
    const feedback = ctx.createGain();
    delay.delayTime.setValueAtTime(0.18, now);
    feedback.gain.setValueAtTime(0.38, now);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(out);
    for (let i = 0; i < 7; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + scaleTime(i * 0.11);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880 * Math.pow(2, i / 7), t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + scaleTime(0.26));
      osc.connect(gain);
      gain.connect(out);
      gain.connect(delay);
      osc.start(t);
      osc.stop(t + scaleTime(0.28));
    }
  };

  const triggerLiveFx = (preset: LiveFxPreset) => {
    playLiveFx(preset);
    if (liveFxTimeoutsRef.current[preset.id]) clearTimeout(liveFxTimeoutsRef.current[preset.id]);
    setActiveLiveFx(prev => ({ ...prev, [preset.id]: true }));
    liveFxTimeoutsRef.current[preset.id] = setTimeout(() => {
      setActiveLiveFx(prev => ({ ...prev, [preset.id]: false }));
    }, (preset.duration / liveFxControlsRef.current.speed) * 1000);
  };

  // Keyboard functions
  const playKeyboardNote = (note: number) => {
    engineManager.init();
    if (!engineManager.ctx) return;

    const instrument = KEYBOARD_INSTRUMENT_MODES.find(i => i.id === keyboardInstrumentMode) ?? KEYBOARD_INSTRUMENT_MODES[0];
    const frequency = 440 * Math.pow(2, (note - 69) / 12);
    const now = engineManager.ctx.currentTime;

    const gain = engineManager.ctx.createGain();
    const filter = engineManager.ctx.createBiquadFilter();
    const master = engineManager.ctx.createGain();

    let mainInput: AudioNode;
    const osc = engineManager.ctx.createOscillator();
    osc.type = instrument.waveform;
    osc.frequency.value = frequency * (instrument.id === 'bass' ? 0.5 : 1);

    if (instrument.id === 'synth') {
      const osc2 = engineManager.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = frequency * 1.01;
      const mix = engineManager.ctx.createGain();
      mix.gain.value = 0.5;
      osc.connect(mix);
      osc2.connect(mix);
      mainInput = mix;
      osc2.start(now);
      osc2.stop(now + 0.35);
    } else if (instrument.id === 'bell') {
      const mod = engineManager.ctx.createOscillator();
      mod.type = 'triangle';
      mod.frequency.value = 220;
      const modGain = engineManager.ctx.createGain();
      modGain.gain.value = 40;
      mod.connect(modGain);
      modGain.connect(osc.frequency);
      mainInput = osc;
      mod.start(now);
      mod.stop(now + 0.5);
    } else {
      mainInput = osc;
    }

    if (instrument.id === 'bass') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.Q.setValueAtTime(1.5, now);
      gain.gain.setValueAtTime(0.35, now);
    } else if (instrument.id === 'bell') {
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(800, now);
      filter.Q.setValueAtTime(1.8, now);
      gain.gain.setValueAtTime(0.18, now);
    } else if (instrument.id === 'synth') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.setValueAtTime(1.2, now);
      gain.gain.setValueAtTime(0.22, now);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2500, now);
      filter.Q.setValueAtTime(0.8, now);
      gain.gain.setValueAtTime(0.2, now);
    }

    mainInput.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    master.connect(engineManager.ctx.destination);

    const release = instrument.id === 'bell' ? 0.6 : instrument.id === 'bass' ? 0.5 : 0.35;
    gain.gain.setTargetAtTime(0.0001, now + 0.02, 0.08);
    master.gain.setValueAtTime(1, now);

    osc.start(now);
    osc.stop(now + release);

    if (instrument.id === 'synth') {
      // synth second oscillator is stopped above
    }
  };

  const startKeyboardRecording = () => {
    setIsRecordingKeyboard(true);
    setRecordedNotes([]);
    recordStartTimeRef.current = Date.now();
  };

  const stopKeyboardRecording = () => {
    setIsRecordingKeyboard(false);
    if (recordedNotes.length > 0) {
      const totalDuration = Math.max(1, Date.now() - recordStartTimeRef.current);
      const stepDuration = totalDuration / 16;
      const stepNotes = new Array<Set<number>>(16).fill(null).map(() => new Set<number>());

      recordedNotes.forEach(({ time, note }) => {
        const step = Math.min(15, Math.max(0, Math.floor((time - recordStartTimeRef.current) / stepDuration)));
        stepNotes[step].add(note);
      });

      const pattern = stepNotes.map((notes) => {
        if (notes.size === 0) return {};
        const values = Array.from(notes).sort((a, b) => a - b);
        return { note: values.length === 1 ? values[0] : values };
      });

      const instrument = KEYBOARD_INSTRUMENT_MODES.find(i => i.id === keyboardInstrumentMode) ?? KEYBOARD_INSTRUMENT_MODES[0];
      const newSound: SoundDef = {
        id: `keyboard-${Date.now()}`,
        name: `${instrument.name} Seq ${recordedSounds.filter(s => s.id.startsWith('keyboard-')).length + 1}`,
        category: 'custom',
        color: instrument.color,
        pattern,
        loopMode: 'full'
      };

      setRecordedSounds(prev => [...prev, newSound]);
    }
  };

  const handleKeyboardNoteDown = (note: number) => {
    if (!pressedKeyboardKeysRef.current.has(note)) {
      pressedKeyboardKeysRef.current.add(note);
      setPressedKeyboardNotes(Array.from(pressedKeyboardKeysRef.current));
      handleKeyboardKeyPress(note);
    }
  };

  const handleKeyboardNoteUp = (note: number) => {
    if (pressedKeyboardKeysRef.current.delete(note)) {
      setPressedKeyboardNotes(Array.from(pressedKeyboardKeysRef.current));
    }
  };

  const handleKeyboardKeyPress = (note: number) => {
    playKeyboardNote(note);
    if (isRecordingKeyboard) {
      setRecordedNotes(prev => [...prev, { time: Date.now(), note }]);
    }
  };

  const categories = [
    { id: 'beat', name: 'Beats' },
    { id: 'effect', name: 'Effects' },
    { id: 'melody', name: 'Melodies' },
    { id: 'bass', name: 'Basses' },
    { id: 'experimental', name: 'Experimental' },
    { id: 'theme', name: '旋律组' },
  ];
  const extraCategories = [
    { id: 'animal', name: 'Animal Samples' },
  ];
  const customCategory = { id: 'custom', name: 'Custom / Recorded' };

  const fxConfig: { key: keyof FxParams; name: string; min: number; max: number }[] = [
    { key: 'lpf', name: 'DJ Lowpass', min: 0, max: 100 },
    { key: 'hpf', name: 'Highpass', min: 0, max: 100 },
    { key: 'volume', name: 'Fade Vol', min: 0, max: 100 },
    { key: 'sidechain', name: 'Ducking', min: 0, max: 100 },
    { key: 'reverb', name: 'Reverb', min: 0, max: 100 },
    { key: 'delay', name: 'Echo', min: 0, max: 100 },
    { key: 'pitch', name: 'Speed/Pitch', min: -12, max: 12 },
    { key: 'panSwing', name: 'Pan Swing', min: 0, max: 100 },
    { key: 'compressor', name: 'Compressor', min: 0, max: 100 },
    { key: 'flanger', name: 'Flanger', min: 0, max: 100 },
  ];

  const workbenchStyle = {
    background:
      colorMode === 'day'
        ? `radial-gradient(circle at 50% 18%, ${activeStyle.panel}, transparent 40%), linear-gradient(135deg, rgba(255,255,255,0.96), rgba(245,247,250,0.86))`
        : `radial-gradient(circle at 50% 20%, ${activeStyle.panel}, transparent 36%), linear-gradient(135deg, ${activeStyle.panel}, rgba(24, 24, 27, 0.5))`,
    borderColor: activeTab.isPlaying
      ? activeStyle.accent
      : colorMode === 'day'
        ? 'rgba(15,23,42,0.1)'
        : 'rgba(255,255,255,0.05)',
  } as React.CSSProperties;
  const isDayMode = colorMode === 'day';
  const softButtonClass = isDayMode
    ? "bg-slate-900/5 hover:bg-slate-900/10 text-slate-700 border-slate-900/10"
    : "bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5";
  const mutedTextClass = isDayMode ? "text-slate-500" : "text-zinc-500";
  const hairlineClass = isDayMode ? "bg-slate-200" : "bg-zinc-800";
  const globalRecordLabel = globalRecordingState === 'waiting'
    ? 'Wait BPM'
    : globalRecordingState === 'recording'
      ? 'Recording'
      : globalRecordingState === 'stopping'
        ? 'Closing'
        : 'Arrange Rec';
  const globalRecordTitle = globalRecordingState === 'waiting'
    ? 'Waiting for the next global BPM loop start. Click again to cancel.'
    : globalRecordingState === 'recording'
      ? 'Click to stop at the next global BPM loop start'
      : globalRecordingState === 'stopping'
        ? 'Waiting for the next global BPM loop start to finish recording'
        : 'Click to start recording at the next global BPM loop start';

  const renderLibraryCategory = (cat: { id: string; name: string }) => {
    const staticItems = AVAILABLE_SOUNDS.filter(s => s.category === cat.id);
    const customItems = cat.id === 'custom' ? recordedSounds : [];
    const items = [...staticItems, ...customItems];

    if (items.length === 0 && cat.id !== 'custom') return null;

    return (
      <div key={cat.id} className="flex flex-col gap-1.5">
        <h3 className={cn("text-[9px] font-bold uppercase tracking-widest pl-1", mutedTextClass)}>{cat.name}</h3>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {items.length === 0 && cat.id === 'custom' && (
             <div className={cn("text-[9px] italic pl-1 py-2", isDayMode ? "text-slate-400" : "text-zinc-700")}>No recordings yet. Hit 'Rec New' upward!</div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, item)}
              className={cn(
                "flex-none w-32 rounded-lg border p-3 flex flex-col justify-between cursor-grab active:cursor-grabbing group transition-colors relative origin-center",
                isDayMode ? "bg-white border-slate-900/10 hover:bg-slate-50 shadow-sm" : "bg-zinc-800/80 border-white/5 hover:bg-zinc-700"
              )}
              title={item.name}
            >
               {cat.id === 'custom' && (
                 <button
                   onClick={(e) => toggleLoopMode(e, item.id)}
                   className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-zinc-600 hover:bg-zinc-500 rounded text-[7px] font-bold text-white shadow-md z-10 uppercase transition-colors"
                 >
                   {item.loopMode === 'fast' ? 'FAST' : 'FULL'}
                 </button>
               )}
               <div className="flex justify-between items-start mb-2">
                  <span className={cn("text-[9px] font-bold uppercase truncate", isDayMode ? "text-slate-800" : "text-white")}>{item.name}</span>
                  <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", item.color)}></div>
               </div>
               <div className="space-y-1.5 mt-auto">
                 <div className="h-4 w-full flex items-end gap-0.5">
                    {[1,3,2,5,4,6].map((h, i) => (
                      <div key={i} className={cn("w-1 flex-1 rounded-t-sm opacity-40 group-hover:opacity-60", item.color)} style={{ height: `${h * 15}%`}}></div>
                    ))}
                 </div>
                 <div className={cn("text-[8px] uppercase tracking-tighter truncate", isDayMode ? "text-slate-400" : "text-zinc-600")}>
                  {cat.id === 'custom' ? 'RECORDED' : cat.id === 'beat' ? 'LOOP / 120' : cat.id === 'animal' ? 'EXTRA / RARE' : 'SYNTH'}
                 </div>
               </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "h-screen font-sans flex flex-col overflow-hidden select-none transition-colors duration-300",
        isDayMode ? "bg-slate-100 text-slate-700" : "bg-[#0c0c0e] text-zinc-300"
      )}
      style={{
        background: isDayMode
          ? `linear-gradient(180deg, #f8fafc 0%, #eef4f8 58%, rgba(255,255,255,0.8) 100%)`
          : `linear-gradient(180deg, #0c0c0e 0%, #101014 58%, ${activeStyle.panel} 100%)`,
      }}
    >
      
      {/* Header / Tabs */}
      <header className={cn(
        "px-4 sm:px-6 flex flex-shrink-0 items-end justify-between gap-3 border-b backdrop-blur-md z-10 w-full pt-4",
        isDayMode ? "border-slate-900/10 bg-white/80" : "border-white/5 bg-black/40"
      )}>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none pb-0">
          {tabs.map((tab) => {
            const isQueued = pendingPlayIds.has(tab.id);
            return (
             <div 
               key={tab.id}
               onClick={() => setActiveTabId(tab.id)}
               onMouseEnter={() => handleTabMouseEnter(tab.id)}
               onMouseLeave={handleTabMouseLeave}
               className={cn(
                 "group relative flex items-center gap-3 px-4 py-3 rounded-t-lg font-bold tracking-widest uppercase text-[10px] cursor-pointer transition-all border border-b-0 min-w-max",
                 activeTabId === tab.id
                   ? isDayMode ? "bg-white border-slate-900/10 text-slate-950 shadow-sm" : "bg-zinc-900 border-white/10 text-white"
                   : isDayMode ? "bg-slate-900/5 border-transparent text-slate-500 hover:text-slate-900 hover:bg-white/70" : "bg-black/20 border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-black/40"
               )}
             >
                <button 
                  onClick={(e) => togglePlayTab(e, tab.id)}
                  className={cn(
                    "w-5 h-5 rounded flex items-center justify-center transition-colors",
                    tab.isPlaying ? "bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]" : isQueued ? "bg-amber-500 text-white animate-pulse" : isDayMode ? "bg-slate-900/10 text-slate-700 hover:bg-slate-900/15" : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  {tab.isPlaying || isQueued ? <Square className="w-2.5 h-2.5" fill="currentColor"/> : <Play className="w-2.5 h-2.5 ml-0.5" fill="currentColor"/>}
                </button>
                <span>{tab.name}</span>
                <span className="flex gap-0.5 w-3 mt-0.5 opacity-80">
                  {tab.isPlaying && (
                     <>
                       <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                       <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-pulse delay-75"></span>
                       <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-pulse delay-150"></span>
                     </>
                  )}
                </span>
                <button
                  onClick={(e) => deleteTab(e, tab.id)}
                  aria-label={`Delete ${tab.name}`}
                  title="Delete page"
                  className={cn(
                    "ml-1 h-5 w-5 rounded-full flex items-center justify-center transition-colors opacity-60 group-hover:opacity-100",
                    isDayMode ? "text-slate-400 hover:bg-slate-900/10 hover:text-slate-900" : "text-zinc-500 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <X className="w-3 h-3" strokeWidth={3} />
                </button>
             </div>
            );
          })}

          <button 
             onClick={addNewTab}
             className={cn(
               "px-4 py-3 rounded-t-lg transition-colors uppercase tracking-widest text-[10px] font-bold border border-transparent flex items-center gap-1.5 ml-2",
               isDayMode ? "bg-slate-900/5 hover:bg-white/80 text-slate-500 hover:text-slate-900" : "bg-black/20 hover:bg-black/40 text-zinc-500 hover:text-zinc-300"
             )}
          >
             <Plus size={12} strokeWidth={3} />
             New
          </button>

          <button
             onClick={handleExportArrangement}
             className="px-3 py-2 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white text-[9px] font-bold uppercase tracking-widest transition-all"
          >
             Export
          </button>
          <button
             onClick={() => importFileInputRef.current?.click()}
             className="px-3 py-2 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white text-[9px] font-bold uppercase tracking-widest transition-all"
          >
             Import
          </button>
          <input
            type="file"
            accept=".musicarr,application/json"
            className="hidden"
            ref={importFileInputRef}
            onChange={handleImportArrangement}
          />
          <button
             onClick={() => setIsKeyboardVisible(true)}
             aria-label="Open keyboard"
             title="Open keyboard"
             className={cn(
               "w-10 h-10 rounded-full flex items-center justify-center transition-all border border-white/10 shadow-sm",
               isKeyboardVisible ? "bg-emerald-500 text-white" : isDayMode ? "bg-slate-900/5 text-slate-600 hover:bg-white hover:text-slate-950 border-slate-900/10" : "bg-black/20 text-zinc-400 hover:bg-white/10 hover:text-white"
             )}
          >
             <Keyboard className="w-5 h-5" />
          </button>
          <button
             onClick={handleClearActiveTab}
             aria-label="Clear current tab"
             title="Clear current tab"
             className={cn(
               "w-10 h-10 rounded-full flex items-center justify-center transition-all border shadow-sm",
               isDayMode ? "bg-slate-900/5 text-slate-600 hover:bg-white hover:text-slate-950 border-slate-900/10" : "bg-black/20 text-zinc-400 hover:bg-white/10 hover:text-white border-white/10"
             )}
          >
             <Trash2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 pb-3">
          <button
             onClick={handleGlobalRecordingToggle}
             aria-label={globalRecordTitle}
             title={globalRecordTitle}
             className={cn(
               "h-10 rounded-full border px-3 sm:px-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm",
               globalRecordingState === 'recording'
                 ? "bg-red-500 text-white border-red-400 animate-pulse shadow-[0_0_24px_rgba(239,68,68,0.28)]"
                 : globalRecordingState === 'waiting'
                   ? "bg-zinc-600 text-zinc-200 border-zinc-500 cursor-wait"
                   : globalRecordingState === 'stopping'
                     ? "bg-zinc-800 text-red-200 border-red-500/40 cursor-wait"
                     : isDayMode ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-700" : "bg-white text-zinc-950 border-white hover:bg-zinc-200"
             )}
          >
             <Circle className={cn(
               "w-3.5 h-3.5",
               globalRecordingState === 'recording' ? "fill-white text-white" : globalRecordingState === 'waiting' ? "fill-zinc-300 text-zinc-300" : "fill-red-500 text-red-500"
             )} />
             <span className="hidden sm:inline">{globalRecordLabel}</span>
             <span className="sm:hidden">{globalRecordingState === 'recording' ? arrangementEvents.length : globalRecordLabel}</span>
          </button>
          <button
             onClick={() => setViewMode(prev => prev === 'timeline' ? 'matrix' : 'timeline')}
             aria-label="Switch timeline view"
             title="Switch timeline view"
             className={cn(
               "h-10 rounded-full border px-3 sm:px-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm",
               viewMode === 'timeline'
                 ? "bg-emerald-500 text-white border-emerald-400"
                 : isDayMode ? "bg-slate-900/5 text-slate-600 hover:bg-white hover:text-slate-950 border-slate-900/10" : "bg-black/20 text-zinc-400 hover:bg-white/10 hover:text-white border-white/10"
             )}
          >
             {viewMode === 'timeline' ? <SkipBack className="w-4 h-4" /> : <ListMusic className="w-4 h-4" />}
             <span className="hidden sm:inline">{viewMode === 'timeline' ? 'Matrix' : 'Timeline'}</span>
             <span className="sm:hidden">{viewMode === 'timeline' ? 'Back' : 'Line'}</span>
          </button>
        </div>

      </header>

      {viewMode === 'timeline' ? renderTimelinePage() : (
      <>
      {/* Main Content Area */}
      <main className="min-h-0 flex-1 w-full flex flex-col p-6 gap-5 overflow-hidden">
        <section className="shrink-0 flex items-center gap-3 overflow-x-auto pb-1 text-[10px] font-medium uppercase tracking-widest scrollbar-none">
          <div className={cn("flex h-10 shrink-0 items-center gap-2 rounded border px-3", isDayMode ? "bg-slate-900/5 border-slate-900/10" : "bg-white/5 border-white/5")}>
            <span className={mutedTextClass}>Preset</span>
            <select
              value={selectedStyleId}
              onChange={(e) => applyStylePreset(e.target.value)}
              className={cn("bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none", isDayMode ? "text-slate-950" : "text-white")}
              title="Switch loops, FX, and visual energy while keeping the current Sound Style"
            >
              {STYLE_PRESETS.map((style) => (
                <option key={style.id} value={style.id} className={isDayMode ? "bg-white text-slate-950" : "bg-zinc-900 text-white"}>
                  {style.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={shuffleActiveTab}
            className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded border px-3 transition-colors", softButtonClass)}
          >
            <Shuffle size={11} />
            Shuffle
          </button>
          <button
            onClick={reverseActiveTab}
            className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded border px-3 transition-colors", softButtonClass)}
            title="Reverse the current page sequence"
          >
            <RotateCcw size={11} />
            Reverse
          </button>
          <button
            onClick={resetWorkbench}
            className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded border px-3 transition-colors", softButtonClass)}
          >
            <RotateCcw size={11} />
            Reset
          </button>
          <button
            onClick={() => setColorMode(prev => prev === 'night' ? 'day' : 'night')}
            className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded border px-3 transition-colors", softButtonClass)}
            aria-label={isDayMode ? 'Switch to night mode' : 'Switch to day mode'}
            title={isDayMode ? 'Switch to night mode' : 'Switch to day mode'}
          >
            {isDayMode ? <Moon size={11} /> : <Sun size={11} />}
            {isDayMode ? 'Night' : 'Day'}
          </button>
        </section>

        <section className="shrink-0 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Wand2 className={cn("w-4 h-4", mutedTextClass)} />
            <h2 className={cn("text-[9px] font-bold uppercase tracking-[0.2em]", isDayMode ? "text-slate-500" : "text-zinc-600")}>Sound Style</h2>
            <span className={cn("text-[9px] uppercase tracking-widest", isDayMode ? "text-slate-400" : "text-zinc-700")}>Same loops, different tone</span>
            <div className={cn("h-px flex-1", hairlineClass)}></div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {AUDIO_STYLES.map((style) => {
              const selected = activeTab.styleId === style.id;

              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => handleStyleChange(style.id)}
                  className={cn(
                    "h-9 shrink-0 rounded border px-3 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                    selected
                      ? isDayMode ? "border-slate-900/20 bg-white text-slate-950 shadow-sm" : "border-white/30 bg-white/15 text-white shadow-[0_0_18px_rgba(255,255,255,0.08)]"
                      : isDayMode ? "border-slate-900/10 bg-white/55 text-slate-500 hover:bg-white hover:text-slate-900" : "border-white/5 bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
                  )}
                  title={`Switch ${activeTab.name} to the ${style.name} sound without changing its loops`}
                >
                  <span className={cn("h-2 w-2 rounded-full", style.accent)}></span>
                  {style.name}
                </button>
              )
            })}
          </div>
        </section>
        
        {/* TOP: Performance Modules (Drop Zones) */}
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
              <h2 className={cn("text-sm font-bold uppercase tracking-widest", isDayMode ? "text-slate-600" : "text-zinc-400")}>Performance Matrix</h2>
              <span
                className="rounded px-2 py-1 text-[9px] font-bold uppercase tracking-widest border"
                style={{ color: activeStyle.accent, borderColor: activeStyle.glow, background: activeStyle.panel }}
              >
                {activeStyle.name}
              </span>
            </div>
            <div className="flex gap-4">
              <span className={cn("flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest", mutedTextClass)}>
                Drag sounds into slots
              </span>
              <span className="flex items-center gap-2 text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                <span
                  className={cn("w-1.5 h-1.5 rounded-full", activeTab.isPlaying ? "animate-pulse" : "")}
                  style={{ backgroundColor: activeStyle.accent }}
                ></span>
                {activeTab.isPlaying ? "Playing" : "Ready To Play"}
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
                    "rounded-full transition-all duration-150 self-end",
                    isBeat ? isDayMode ? "bg-slate-900/15" : "bg-white/15" : isDayMode ? "bg-slate-900/8" : "bg-white/8"
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
                const isPlayingNow = activeTab.isPlaying && slot && slot.pattern[activeTab.activeStep] && (slot.pattern[activeTab.activeStep].note || slot.pattern[activeTab.activeStep].drum || slot.pattern[activeTab.activeStep].exp);
                const isMuted = activeTab.mutedSlots[index];

                return (
                  <div 
                    key={index}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragOver={handleDragOver}
                    onClick={() => toggleMute(index)}
                    onMouseEnter={() => handleModuleMouseEnter(index)}
                    onMouseLeave={handleModuleMouseLeave}
                    className={cn(
                      "relative w-14 h-32 sm:w-20 sm:h-44 lg:w-24 lg:h-56 rounded-xl border-2 flex flex-col items-center justify-end pb-2 transition-all overflow-hidden cursor-pointer",
                      slot
                        ? isMuted
                          ? isDayMode ? 'border-slate-900/10 bg-slate-200/80' : 'border-white/5 bg-zinc-900'
                          : isDayMode ? 'border-slate-900/15 bg-white shadow-lg' : 'border-white/20 bg-zinc-800 shadow-xl'
                        : isDayMode ? 'bg-white/50 border-slate-900/15 border-dashed hover:bg-white' : 'bg-white/5 border-white/10 border-dashed hover:bg-white/10'
                    )}
                    style={{
                      borderColor: (!isMuted && isPlayingNow) ? activeStyle.accent : undefined,
                      transform: (!isMuted && isPlayingNow) ? `translateY(-${3 + beatEnergy * 3}px)` : undefined,
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
                          {/* Avatar representation */}
                          <div 
                            className={cn("w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center mb-2 border border-white/10 transition-transform duration-100", slot.color)}
                            style={{
                              transform: (!isMuted && isPlayingNow) ? `scale(${1.06 + beatEnergy * 0.08})` : undefined,
                            }}
                          >
                            <UserCircle2 className="w-2/3 h-2/3 text-white/80" strokeWidth={1.5} />
                          </div>
                          
                          <div className={cn("text-[8px] sm:text-[10px] font-bold opacity-80 uppercase tracking-widest truncate w-full text-center px-1", isDayMode ? "text-slate-700" : "text-zinc-300")}>{slot.name}</div>
                          
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleClearSlot(index); }}
                            className="absolute top-2 right-2 p-1 rounded-full bg-black/40 hover:bg-black/60 text-white/50 hover:text-white transition-colors"
                          >
                            <X className="w-2.5 h-2.5" strokeWidth={3} />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    {/* Visualizer Backdrop */}
                    {slot && activeTab.isPlaying && !isMuted && (
                      <motion.div 
                        className={cn("absolute inset-x-0 bottom-0 opacity-20", slot.color)}
                        animate={{ height: isPlayingNow ? '100%' : '10%' }}
                        transition={{ duration: 0.1 }}
                      />
                    )}
                    
                    {!slot && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                          <span className={cn("text-xl font-light", isDayMode ? "text-slate-900/20" : "text-white/10")}>+</span>
                          <span className={cn("text-[8px] font-bold uppercase tracking-widest", isDayMode ? "text-slate-900/25" : "text-white/15")}>Drop</span>
                       </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Fx Panel - Slot Level */}
        <AnimatePresence>
          {hoveredFxSlot !== null && activeTab.slots[hoveredFxSlot] && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onMouseEnter={() => clearTimeout(fxTimeoutRef.current)}
              onMouseLeave={handleModuleMouseLeave}
              className="absolute z-50 left-0 right-0 top-[50%] lg:top-[60%] mx-auto w-[95%] max-w-5xl bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-5 pointer-events-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Module FX: {activeTab.slots[hoveredFxSlot]?.name} (Slot {hoveredFxSlot + 1})
                  </h3>
                  <button 
                    onClick={handleResetFx}
                    className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] font-bold text-emerald-400 uppercase tracking-tighter transition-colors border border-emerald-500/20"
                  >
                    Reset FX
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-6">
                {fxConfig.map(cfg => (
                  <div key={cfg.key} className="flex flex-col gap-2">
                     <div className="flex justify-between items-end">
                        <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{cfg.name}</span>
                        <span className="text-[10px] text-zinc-300 font-mono bg-white/5 px-1.5 py-0.5 rounded flex-shrink-0 min-w-[28px] text-center">
                           {activeTab.fxSlots[hoveredFxSlot][cfg.key]}
                        </span>
                     </div>
                     <input 
                        type="range"
                        min={cfg.min}
                        max={cfg.max}
                        value={activeTab.fxSlots[hoveredFxSlot][cfg.key]}
                        onChange={(e) => handleFxChange(cfg.key, parseFloat(e.target.value))}
                        className="w-full h-1.5 focus:outline-none appearance-none bg-zinc-800 rounded-lg cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full"
                     />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fx Panel - Master/Tab Level */}
        <AnimatePresence>
          {hoveredTabFxId !== null && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onMouseEnter={() => clearTimeout(tabFxTimeoutRef.current)}
              onMouseLeave={handleTabMouseLeave}
              className="absolute z-50 left-0 right-0 top-16 mx-auto w-[95%] max-w-5xl bg-indigo-950/95 backdrop-blur-xl border border-indigo-500/30 rounded-b-2xl p-6 shadow-2xl flex flex-col gap-5 pointer-events-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2 text-indigo-300">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    Master FX: {tabs.find(t => t.id === hoveredTabFxId)?.name}
                  </h3>
                  <button 
                    onClick={handleResetMasterFx}
                    className="px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-[9px] font-bold text-indigo-300 uppercase tracking-tighter transition-colors border border-indigo-500/30"
                  >
                    Reset Global
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-6">
                {fxConfig.map(cfg => {
                  const t = tabs.find(t => t.id === hoveredTabFxId);
                  if (!t) return null;
                  return (
                    <div key={cfg.key} className="flex flex-col gap-2">
                       <div className="flex justify-between items-end">
                          <span className="text-[10px] text-indigo-300/80 uppercase tracking-wider">{cfg.name}</span>
                          <span className="text-[10px] text-indigo-200 font-mono bg-indigo-900/50 px-1.5 py-0.5 rounded flex-shrink-0 min-w-[28px] text-center">
                             {t.masterFx[cfg.key]}
                          </span>
                       </div>
                       <input 
                          type="range"
                          min={cfg.min}
                          max={cfg.max}
                          value={t.masterFx[cfg.key]}
                          onChange={(e) => handleMasterFxChange(cfg.key, parseFloat(e.target.value))}
                          className="w-full h-1.5 focus:outline-none appearance-none bg-indigo-950/50 rounded-lg cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-full outline border border-indigo-800/50"
                       />
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BOTTOM: Music Modules (Draggable Sounds) */}
        <section className={cn(
          "relative z-20 h-52 flex flex-col gap-2 shrink-0 rounded-2xl border p-3",
          isDayMode ? "border-slate-900/10 bg-white/85 shadow-[0_-18px_40px_rgba(148,163,184,0.25)]" : "border-white/5 bg-[#0d0d10] shadow-[0_-18px_40px_rgba(0,0,0,0.35)]"
        )}>
          <div className="flex items-center gap-2">
            <h2 className={cn("text-[9px] font-bold uppercase tracking-[0.2em]", isDayMode ? "text-slate-500" : "text-zinc-600")}>Sample Library</h2>
            <div className={cn("flex-1 h-px", hairlineClass)}></div>
            
            {/* Record Controls */}
            <div className="flex items-center gap-2">
              <input 
                type="file" 
                accept="audio/*" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className={cn("flex items-center gap-1.5 px-3 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-all", isDayMode ? "bg-slate-900/5 text-slate-500 hover:bg-slate-900/10" : "bg-white/5 text-zinc-400 hover:bg-white/10")}
              >
                <Upload size={10} />
                Upload
              </button>
              <button 
                onClick={isRecording ? stopRecording : startRecording}
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
            {categories.map(renderLibraryCategory)}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsExtraLibraryOpen(prev => !prev)}
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
              {isExtraLibraryOpen && extraCategories.map((cat) => (
                <div key={cat.id} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenExtraCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                    className={cn(
                      "h-8 flex items-center justify-between rounded-lg border px-3 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors",
                      isDayMode ? "border-slate-900/10 bg-white/70 text-slate-500 hover:bg-white hover:text-slate-800" : "border-white/5 bg-zinc-900/80 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    )}
                    aria-expanded={Boolean(openExtraCategories[cat.id])}
                  >
                    <span>{cat.name}</span>
                    {openExtraCategories[cat.id] ? <X size={11} /> : <Plus size={11} />}
                  </button>
                  {openExtraCategories[cat.id] && renderLibraryCategory(cat)}
                </div>
              ))}
            </div>
            {renderLibraryCategory(customCategory)}
          </div>
        </section>
        
      </main>
      </>
      )}

      {/* Floating Keyboard */}
      <AnimatePresence>
        {isKeyboardVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setIsKeyboardVisible(false);
              }
            }}
          >
            <motion.div
              initial={{ y: 24, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full max-w-4xl rounded-3xl border border-white/10 bg-zinc-950/95 shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4 p-4 border-b border-white/10">
                <div className="space-y-1">
                  <h2 className="text-base font-bold uppercase tracking-[0.25em] text-zinc-100">Keyboard / Live FX</h2>
                  <p className="text-[11px] text-zinc-500 max-w-xl">Tap keys for notes or trigger live sound cues with the number keys.</p>
                </div>
                <button
                  onClick={() => setIsKeyboardVisible(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors"
                  aria-label="Close keyboard"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {KEYBOARD_INSTRUMENT_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setKeyboardInstrumentMode(mode.id)}
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
                      onClick={isRecordingKeyboard ? stopKeyboardRecording : startKeyboardRecording}
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
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {KEYBOARD_NOTES.map((row, rowIndex) =>
                      row.map((note, colIndex) => {
                        const keyIndex = rowIndex * 4 + colIndex;
                        const physicalKey = KEYBOARD_PHYSICAL_KEYS[keyIndex];
                        const isPressed = pressedKeyboardNotes.includes(note);
                        const instrument = KEYBOARD_INSTRUMENT_MODES.find(i => i.id === keyboardInstrumentMode) ?? KEYBOARD_INSTRUMENT_MODES[0];
                        return (
                          <button
                            key={`${rowIndex}-${colIndex}`}
                            onMouseDown={() => handleKeyboardNoteDown(note)}
                            onMouseUp={() => handleKeyboardNoteUp(note)}
                            onMouseLeave={() => handleKeyboardNoteUp(note)}
                            className={cn(
                              "aspect-square rounded-2xl border flex flex-col items-center justify-center text-xs font-mono transition-all",
                              isPressed
                                ? `${instrument.color} text-white border-white/50 shadow-lg shadow-current scale-105`
                                : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 border-white/10 text-zinc-300 hover:text-white"
                            )}
                          >
                            <span>{KEYBOARD_NOTE_LABELS[keyIndex]}</span>
                            <span className="text-[8px] opacity-70 mt-1">{physicalKey.toUpperCase()}</span>
                          </button>
                        );
                      })
                    )}
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
                        onChange={(e) => setLiveFxControls(prev => ({ ...prev, speed: Number(e.target.value) }))}
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
                        onChange={(e) => setLiveFxControls(prev => ({ ...prev, volume: Number(e.target.value) }))}
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
                        onChange={(e) => setLiveFxControls(prev => ({ ...prev, fadeIn: Number(e.target.value) }))}
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
                        onChange={(e) => setLiveFxControls(prev => ({ ...prev, fadeOut: Number(e.target.value) }))}
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
                          onClick={() => triggerLiveFx(preset)}
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
    </div>
  );
}
