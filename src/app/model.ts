import { AVAILABLE_SOUNDS, type AudioStyleId, type SoundDef, type FxParams, defaultFx } from '../audio';
import type { AudioFrameMessage } from '../lib/showControlClient';

export const KEYBOARD_INSTRUMENT_MODES = [
  { id: 'piano', name: 'Piano', color: 'bg-blue-500', waveform: 'sine' as OscillatorType },
  { id: 'synth', name: 'Synth', color: 'bg-purple-500', waveform: 'sawtooth' as OscillatorType },
  { id: 'bass', name: 'Bass', color: 'bg-cyan-500', waveform: 'square' as OscillatorType },
  { id: 'bell', name: 'Bell', color: 'bg-amber-500', waveform: 'triangle' as OscillatorType },
];

export const BPM_PRESETS = [90, 110, 120, 130, 140, 160];
export const KEYBOARD_PHYSICAL_KEYS = ['q','w','e','r','t','y','u','i','o','p','a','s','d','f','g','h','j','k','l','z','x','c','v','b','n','m'];
export const KEYBOARD_BASE_NOTE = 48;
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const formatMidiLabel = (note: number) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
export const KEYBOARD_KEY_DEFS = KEYBOARD_PHYSICAL_KEYS.map((physicalKey, index) => {
  const note = KEYBOARD_BASE_NOTE + index;
  return {
    physicalKey,
    note,
    label: formatMidiLabel(note),
    isBlack: [1, 3, 6, 8, 10].includes(note % 12),
  };
});
export const KEYBOARD_KEY_ROWS = [
  KEYBOARD_KEY_DEFS.slice(0, 10),
  KEYBOARD_KEY_DEFS.slice(10, 19),
  KEYBOARD_KEY_DEFS.slice(19),
];
export const FLAT_KEYBOARD_NOTES = KEYBOARD_KEY_DEFS.map((key) => key.note);

export interface KeyboardRecordingNote {
  time: number;
  note: number;
  instrumentId: string;
  sustain: boolean;
}

export type LiveFxKind = 'heartbeat' | 'atmosphere' | 'riser' | 'impact' | 'stutter' | 'air' | 'alarm' | 'spark';

export interface LiveFxPreset {
  id: LiveFxKind;
  name: string;
  key: string;
  label: string;
  color: string;
  duration: number;
}

export interface LiveFxControls {
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export const LIVE_FX_PRESETS: LiveFxPreset[] = [
  { id: 'heartbeat', name: 'Heartbeat', key: '1', label: 'Pulse tension', color: 'bg-red-500', duration: 4.2 },
  { id: 'atmosphere', name: 'Atmosphere', key: '2', label: 'Dark room bed', color: 'bg-indigo-500', duration: 5.2 },
  { id: 'riser', name: 'Riser', key: '3', label: 'Build transition', color: 'bg-cyan-500', duration: 3.4 },
  { id: 'impact', name: 'Impact', key: '4', label: 'Scene hit', color: 'bg-orange-500', duration: 2.4 },
  { id: 'stutter', name: 'Stutter', key: '5', label: 'Glitch cue', color: 'bg-fuchsia-500', duration: 2.1 },
  { id: 'air', name: 'Air Wash', key: '6', label: 'Soft sweep', color: 'bg-sky-500', duration: 4.5 },
  { id: 'alarm', name: 'Warning', key: '7', label: 'Alert pulse', color: 'bg-amber-500', duration: 3.2 },
  { id: 'spark', name: 'Sparkle', key: '8', label: 'Bright accent', color: 'bg-emerald-500', duration: 2.6 },
];

export interface TabData {
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

export type ViewMode = 'matrix' | 'timeline';
export type GlobalRecordingState = 'idle' | 'waiting' | 'recording' | 'stopping';
export type AppRoute = 'main' | 'dj';

export interface ArrangementEvent {
  id: string;
  tabId: string;
  tabName: string;
  startMs: number;
  durationMs?: number;
  tab: TabData;
}

export interface TimelineClip {
  id: string;
  soundId: string;
  track: number;
  start: number;
  duration: number;
  trimStart: number;
}

export interface TimelinePointerEdit {
  clipId: string;
  mode: 'move' | 'trim-start' | 'trim-end';
  pointerStartX: number;
  pointerStartY: number;
  clipStart: number;
  clipDuration: number;
  clipTrimStart: number;
  clipTrack: number;
}

export interface TimelineTransportEdit {
  mode: 'playhead' | 'range-start' | 'range-end' | 'range-move';
  pointerStartX: number;
  rangeStart: number;
  rangeEnd: number;
  playhead: number;
  wasPlaying: boolean;
}

export interface ScratchEdit {
  pointerStartX: number;
  startPosition: number;
  lastX: number;
  lastAt: number;
  wasPlaying: boolean;
}

export interface StylePreset {
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

export type ColorMode = 'night' | 'day';
export type AudioTransportState = 'stopped' | 'playing' | 'paused';
export type ArrangementFilePermissionMode = 'read' | 'readwrite';

export interface ArrangementFileWritable {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
}

export interface ArrangementFileHandle {
  name: string;
  createWritable: () => Promise<ArrangementFileWritable>;
  queryPermission?: (descriptor?: { mode?: ArrangementFilePermissionMode }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: ArrangementFilePermissionMode }) => Promise<PermissionState>;
}

export interface ArrangementSaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

export interface WindowWithArrangementFilePicker extends Window {
  showSaveFilePicker?: (options?: ArrangementSaveFilePickerOptions) => Promise<ArrangementFileHandle>;
}

export interface PersistedSnapshot<T> {
  version: string;
  updatedAt: number;
  data: T;
  degraded?: boolean;
}

export interface PersistedAudioBufferData {
  bufferBase64: string;
  sampleRate: number;
  numberOfChannels: number;
  duration: number;
}

export interface PersistedDJTrack {
  id: string;
  fileName: string;
  duration: number;
  audio?: PersistedAudioBufferData;
}

export interface PersistedDJState {
  tracks: PersistedDJTrack[];
  activeTrackId: string | null;
  fileName?: string;
  audio?: PersistedAudioBufferData;
  position: number;
  isReverse: boolean;
  bpm: number;
  playbackSpeed: number;
  fx: FxParams;
}

export interface PersistenceSyncMessage {
  key: string;
  updatedAt: number;
  sourceId: string;
  cleared?: boolean;
}

export type MixerAudioTelemetry = AudioFrameMessage & {
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

export const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
export const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
export const MUSICARR_FILE_MIME = 'application/json';
export const PERSISTENCE_DB_NAME = 'codex-music-editor-persistence';
export const PERSISTENCE_DB_VERSION = 1;
export const PERSISTENCE_STATE_VERSION = '2026-05-24-dj-queue-v1';
export const PERSISTENCE_STORE = 'snapshots';
export const MAIN_PERSISTENCE_KEY = 'main-editor';
export const DJ_PERSISTENCE_KEY = 'dj-audio-editor';
export const PERSISTENCE_SYNC_CHANNEL = 'codex-music-editor-persistence-sync';
export const PERSISTENCE_SYNC_STORAGE_KEY = 'codex-music-editor-persistence-sync-event';
export const PERSISTENCE_LOCAL_STORAGE_PREFIX = 'codex-music-editor-persist:';
export const DJ_AUDIO_ROUTE = '/dj-audio';
export const BAND_SHAPE = [0.22, 0.45, 0.74, 1, 0.74, 0.45, 0.22];
export const CATEGORY_BAND_CENTERS: Record<string, number> = {
  beat: 1,
  bass: 3,
  melody: 7,
  theme: 8,
  animal: 9,
  custom: 6,
  effect: 12,
  experimental: 14,
};
export const CATEGORY_IMPACT: Record<string, number> = {
  beat: 1,
  bass: 0.92,
  melody: 0.8,
  theme: 0.84,
  animal: 0.78,
  custom: 0.76,
  effect: 0.68,
  experimental: 0.64,
};

export const DJ_FX_CONTROLS: { key: keyof FxParams; name: string; min: number; max: number; step?: number }[] = [
  { key: 'lpf', name: 'DJ Lowpass', min: 0, max: 100 },
  { key: 'hpf', name: 'Highpass', min: 0, max: 100 },
  { key: 'volume', name: 'Volume', min: 0, max: 100 },
  { key: 'sidechain', name: 'Ducking', min: 0, max: 100 },
  { key: 'reverb', name: 'Reverb', min: 0, max: 100 },
  { key: 'delay', name: 'Echo', min: 0, max: 100 },
  { key: 'pitch', name: 'Pitch', min: -12, max: 12, step: 1 },
  { key: 'panSwing', name: 'Pan Swing', min: 0, max: 100 },
  { key: 'compressor', name: 'Compressor', min: 0, max: 100 },
  { key: 'flanger', name: 'Flanger', min: 0, max: 100 },
];

export const getAppRouteFromPath = (): AppRoute => {
  if (typeof window === 'undefined') return 'main';
  return window.location.pathname === DJ_AUDIO_ROUTE ? 'dj' : 'main';
};

export const formatDjTime = (value: number) => {
  if (!Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(Math.max(0, value) / 60);
  const seconds = Math.floor(Math.max(0, value) % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

export const createIdFragment = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? uuid.slice(0, 8) : Math.random().toString(36).slice(2, 10);
};

export const createDjTrackId = () => `dj-track-${Date.now()}-${createIdFragment()}`;

export const makeFx = (overrides: Partial<FxParams> = {}): FxParams => ({
  ...defaultFx(),
  ...overrides,
});

export const STYLE_PRESETS: StylePreset[] = [
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

export const STORAGE_KEY = 'codex-music-workbench-v1';
export const COLOR_MODE_STORAGE_KEY = 'codex-music-workbench-color-mode';

export const findSound = (id: string) => AVAILABLE_SOUNDS.find((sound) => sound.id === id) ?? null;

export const audioStyleForPreset = (presetId: string): AudioStyleId => {
  if (['warehouse', 'edm'].includes(presetId)) return 'club';
  if (['breaks', 'dub-bass'].includes(presetId)) return 'techno';
  if (['dream', 'cinematic'].includes(presetId)) return 'synthwave';
  if (['hiphop', 'drill'].includes(presetId)) return 'trap';
  if (['indie', 'rnb', 'neo-soul', 'afro-rnb', 'latin'].includes(presetId)) return 'piano';
  return 'default';
};

export const createStyleTab = (preset: StylePreset, id = 'tab-1', styleId: AudioStyleId = audioStyleForPreset(preset.id)): TabData => {
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

export const createCodexSongTab = (): TabData => createStyleTab(STYLE_PRESETS[0]);

export const hasStepHit = (slot: SoundDef | null, step: number) => {
  if (!slot) return false;
  const stepData = slot.pattern[step];
  return Boolean(stepData && (stepData.note || stepData.drum || stepData.exp));
};

export const getStepProgress = (bpm: number) => {
  const safeBpm = Math.max(1, bpm || 120);
  const stepDurationMs = 60000 / safeBpm / 4;
  return (performance.now() % stepDurationMs) / stepDurationMs;
};

export const buildFrequencyBands = (
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

export const buildMixerTelemetry = (
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

export const CLIP_COLOR_CLASSES = ['bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-fuchsia-500', 'bg-rose-500', 'bg-lime-500'];
export const TIMELINE_TRACKS = 5;
export const DEFAULT_TIMELINE_SECONDS = 32;
export const PIXELS_PER_SECOND = 84;
export const TIMELINE_SNAP = 0.25;
export const TRACK_ROW_HEIGHT = 104;

export const getInternalRecordingMimeType = () => {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
};

export const cloneTabForRecording = (tab: TabData): TabData => ({
  ...tab,
  slots: [...tab.slots],
  mutedSlots: [...tab.mutedSlots],
  fxSlots: tab.fxSlots.map(fx => ({ ...fx })),
  masterFx: { ...tab.masterFx },
  isPlaying: false,
  activeStep: 0,
});

export const triggerOfflineDrum = (ctx: OfflineAudioContext, destination: AudioNode, type: string, time: number, gainValue = 0.55) => {
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

export const triggerOfflineSynth = (ctx: OfflineAudioContext, destination: AudioNode, midiNote: number, category: string, time: number, gainValue = 0.18) => {
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

export const renderArrangementBuffer = async (events: ArrangementEvent[]): Promise<AudioBuffer | null> => {
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

export const hydrateColorMode = (): ColorMode => {
  if (typeof window === 'undefined') return 'night';
  return window.localStorage.getItem(COLOR_MODE_STORAGE_KEY) === 'day' ? 'day' : 'night';
};

export const hydrateSavedTabs = (): { tabs: TabData[]; styleId: string } | null => {
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

export const sanitizeMusicarrFileName = (fileName: string) => {
  const safeName = fileName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  const baseName = safeName || 'arrangement';
  return baseName.toLowerCase().endsWith('.musicarr') ? baseName : `${baseName}.musicarr`;
};

export const isQuotaExceededError = (err: unknown) => (
  err instanceof DOMException
  && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
);

export const openPersistenceDb = () => new Promise<IDBDatabase | null>((resolve) => {
  if (typeof indexedDB === 'undefined') {
    resolve(null);
    return;
  }

  const request = indexedDB.open(PERSISTENCE_DB_NAME, PERSISTENCE_DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(PERSISTENCE_STORE)) {
      db.createObjectStore(PERSISTENCE_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
  request.onblocked = () => resolve(null);
});

export const localPersistenceKey = (key: string) => `${PERSISTENCE_LOCAL_STORAGE_PREFIX}${key}`;

export const readPersistedSnapshot = async <T,>(key: string): Promise<PersistedSnapshot<T> | null> => {
  const db = await openPersistenceDb();
  if (!db) {
    try {
      const raw = window.localStorage.getItem(localPersistenceKey(key));
      if (!raw) return null;
      const snapshot = JSON.parse(raw) as PersistedSnapshot<T>;
      if (snapshot.version !== PERSISTENCE_STATE_VERSION) {
        window.localStorage.removeItem(localPersistenceKey(key));
        return null;
      }
      return snapshot;
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    const tx = db.transaction(PERSISTENCE_STORE, 'readonly');
    const request = tx.objectStore(PERSISTENCE_STORE).get(key);
    request.onsuccess = () => {
      const snapshot = request.result as PersistedSnapshot<T> | undefined;
      if (!snapshot || snapshot.version !== PERSISTENCE_STATE_VERSION) {
        if (snapshot) setTimeout(() => deletePersistedSnapshot(key), 0);
        resolve(null);
        return;
      }
      resolve(snapshot);
    };
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      resolve(null);
    };
  });
};

export const writePersistedSnapshot = async <T,>(key: string, snapshot: PersistedSnapshot<T>) => {
  const db = await openPersistenceDb();
  if (!db) {
    window.localStorage.setItem(localPersistenceKey(key), JSON.stringify(snapshot));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PERSISTENCE_STORE, 'readwrite');
    tx.objectStore(PERSISTENCE_STORE).put(snapshot, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      const err = tx.error;
      db.close();
      reject(err);
    };
    tx.onabort = () => {
      const err = tx.error;
      db.close();
      reject(err);
    };
  });
};

export const deletePersistedSnapshot = async (key: string) => {
  const db = await openPersistenceDb();
  if (!db) {
    try {
      window.localStorage.removeItem(localPersistenceKey(key));
    } catch {
      // Ignore local cache cleanup failures.
    }
    return;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(PERSISTENCE_STORE, 'readwrite');
    tx.objectStore(PERSISTENCE_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
};

export const emitPersistenceSync = (message: PersistenceSyncMessage) => {
  if (typeof window === 'undefined') return;
  try {
    const channel = new BroadcastChannel(PERSISTENCE_SYNC_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel is optional; storage events provide the fallback.
  }

  try {
    window.localStorage.setItem(PERSISTENCE_SYNC_STORAGE_KEY, JSON.stringify(message));
  } catch {
    // Ignore sync fallback failures.
  }
};

export const encodePersistedAudioBuffer = (buffer: AudioBuffer): PersistedAudioBufferData => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const blockAlign = numChannels * bitsPerSample / 8;
  const wav = new ArrayBuffer(44 + buffer.length * blockAlign);
  const view = new DataView(wav);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + buffer.length * blockAlign, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
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

  return {
    bufferBase64: btoa(binary),
    sampleRate,
    numberOfChannels: numChannels,
    duration: buffer.duration,
  };
};

export const decodePersistedAudioBuffer = async (ctx: AudioContext, data: PersistedAudioBufferData) => {
  const binaryString = atob(data.bufferBase64);
  const arrayBuffer = new ArrayBuffer(binaryString.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < binaryString.length; i++) {
    view[i] = binaryString.charCodeAt(i);
  }
  return ctx.decodeAudioData(arrayBuffer);
};
