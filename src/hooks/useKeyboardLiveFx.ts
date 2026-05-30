import { useEffect, useRef, useState } from 'react';
import { engineManager, type SoundDef } from '../audio';
import {
  FLAT_KEYBOARD_NOTES,
  KEYBOARD_INSTRUMENT_MODES,
  KEYBOARD_PHYSICAL_KEYS,
  LIVE_FX_PRESETS,
  type KeyboardRecordingNote,
  type LiveFxControls,
  type LiveFxPreset,
} from '../app/model';

interface UseKeyboardLiveFxOptions {
  recordedSounds: SoundDef[];
  setRecordedSounds: React.Dispatch<React.SetStateAction<SoundDef[]>>;
}

export function useKeyboardLiveFx({ recordedSounds, setRecordedSounds }: UseKeyboardLiveFxOptions) {
  // Keyboard states
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isRecordingKeyboard, setIsRecordingKeyboard] = useState(false);
  const [keyboardInstrumentMode, setKeyboardInstrumentMode] = useState(KEYBOARD_INSTRUMENT_MODES[0].id);
  const [isKeyboardSustainEnabled, setIsKeyboardSustainEnabled] = useState(false);
  const [recordedNotes, setRecordedNotes] = useState<KeyboardRecordingNote[]>([]);
  const [pressedKeyboardNotes, setPressedKeyboardNotes] = useState<number[]>([]);
  const [activeLiveFx, setActiveLiveFx] = useState<Record<string, boolean>>({});
  const [liveFxControls, setLiveFxControls] = useState<LiveFxControls>({
    speed: 1,
    volume: 1.2,
    fadeIn: 0.04,
    fadeOut: 0.25,
  });
  const pressedKeyboardKeysRef = useRef<Set<number>>(new Set());
  const keyboardInstrumentModeRef = useRef(keyboardInstrumentMode);
  const isRecordingKeyboardRef = useRef(isRecordingKeyboard);
  const keyboardSustainRef = useRef(isKeyboardSustainEnabled);
  const recordedNotesRef = useRef<KeyboardRecordingNote[]>([]);
  const liveFxTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const liveFxControlsRef = useRef(liveFxControls);
  const recordStartTimeRef = useRef<number>(0);
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
  }, [isKeyboardVisible]);

  useEffect(() => {
    return () => {
      Object.values(liveFxTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    liveFxControlsRef.current = liveFxControls;
  }, [liveFxControls]);

  useEffect(() => {
    keyboardInstrumentModeRef.current = keyboardInstrumentMode;
  }, [keyboardInstrumentMode]);

  useEffect(() => {
    isRecordingKeyboardRef.current = isRecordingKeyboard;
  }, [isRecordingKeyboard]);

  useEffect(() => {
    keyboardSustainRef.current = isKeyboardSustainEnabled;
  }, [isKeyboardSustainEnabled]);

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
  const getKeyboardInstrument = (instrumentId: string) => (
    KEYBOARD_INSTRUMENT_MODES.find(i => i.id === instrumentId) ?? KEYBOARD_INSTRUMENT_MODES[0]
  );

  const triggerKeyboardSynthVoice = (
    ctx: BaseAudioContext,
    destination: AudioNode,
    note: number,
    instrumentId: string,
    startTime: number,
    sustain: boolean,
  ) => {
    const instrument = getKeyboardInstrument(instrumentId);
    const frequency = 440 * Math.pow(2, (note - 69) / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const master = ctx.createGain();
    const tail = sustain ? 1.35 : 0;
    const duration = instrument.id === 'bell'
      ? 0.72 + tail
      : instrument.id === 'bass'
        ? 0.54 + tail * 0.72
        : 0.44 + tail * 0.86;
    const peak = instrument.id === 'bass' ? 0.34 : instrument.id === 'bell' ? 0.2 : instrument.id === 'synth' ? 0.24 : 0.22;

    let mainInput: AudioNode;
    let extraOsc: OscillatorNode | null = null;
    let modOsc: OscillatorNode | null = null;
    osc.type = instrument.waveform;
    osc.frequency.setValueAtTime(frequency * (instrument.id === 'bass' ? 0.5 : 1), startTime);

    if (instrument.id === 'synth') {
      extraOsc = ctx.createOscillator();
      extraOsc.type = 'sawtooth';
      extraOsc.frequency.setValueAtTime(frequency * 1.01, startTime);
      const mix = ctx.createGain();
      mix.gain.setValueAtTime(0.5, startTime);
      osc.connect(mix);
      extraOsc.connect(mix);
      mainInput = mix;
    } else if (instrument.id === 'bell') {
      modOsc = ctx.createOscillator();
      modOsc.type = 'triangle';
      modOsc.frequency.setValueAtTime(220, startTime);
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(44, startTime);
      modOsc.connect(modGain);
      modGain.connect(osc.frequency);
      mainInput = osc;
    } else {
      mainInput = osc;
    }

    if (instrument.id === 'bass') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(680, startTime);
      filter.frequency.exponentialRampToValueAtTime(240, startTime + Math.min(duration, 0.8));
      filter.Q.setValueAtTime(1.5, startTime);
    } else if (instrument.id === 'bell') {
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(720, startTime);
      filter.Q.setValueAtTime(1.8, startTime);
    } else if (instrument.id === 'synth') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, startTime);
      filter.frequency.exponentialRampToValueAtTime(sustain ? 900 : 1200, startTime + Math.min(duration, 0.9));
      filter.Q.setValueAtTime(1.2, startTime);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, startTime);
      filter.Q.setValueAtTime(0.8, startTime);
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.015);
    gain.gain.setValueAtTime(peak * (sustain ? 0.72 : 0.5), startTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    master.gain.setValueAtTime(0.96, startTime);

    mainInput.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    master.connect(destination);

    if (sustain) {
      const delay = ctx.createDelay(0.45);
      const feedback = ctx.createGain();
      const wet = ctx.createGain();
      delay.delayTime.setValueAtTime(0.18, startTime);
      feedback.gain.setValueAtTime(0.22, startTime);
      wet.gain.setValueAtTime(0.18, startTime);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(destination);
      gain.connect(delay);
    }

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    if (extraOsc) {
      extraOsc.start(startTime);
      extraOsc.stop(startTime + duration + 0.05);
    }
    if (modOsc) {
      modOsc.start(startTime);
      modOsc.stop(startTime + Math.min(duration, 1.6));
    }
  };

  const renderKeyboardRecordingBuffer = async (notes: KeyboardRecordingNote[], totalDurationMs: number) => {
    const sampleRate = 44100;
    const tail = notes.some(note => note.sustain) ? 1.6 : 0.8;
    const totalSeconds = Math.min(64, Math.max(1, totalDurationMs / 1000 + tail));
    const ctx = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.92, 0);
    master.connect(ctx.destination);
    notes.forEach((event) => {
      const start = Math.max(0, (event.time - recordStartTimeRef.current) / 1000);
      if (start < totalSeconds) {
        triggerKeyboardSynthVoice(ctx, master, event.note, event.instrumentId, start, event.sustain);
      }
    });
    return ctx.startRendering();
  };

  const playKeyboardNote = (note: number) => {
    engineManager.init();
    const ctx = engineManager.ctx;
    if (!ctx) return;
    triggerKeyboardSynthVoice(
      ctx,
      ctx.destination,
      note,
      keyboardInstrumentModeRef.current,
      ctx.currentTime,
      keyboardSustainRef.current,
    );
  };

  const startKeyboardRecording = () => {
    setIsRecordingKeyboard(true);
    recordedNotesRef.current = [];
    setRecordedNotes([]);
    recordStartTimeRef.current = Date.now();
  };

  const stopKeyboardRecording = async () => {
    setIsRecordingKeyboard(false);
    isRecordingKeyboardRef.current = false;
    const notes = recordedNotesRef.current;
    if (notes.length > 0) {
      const totalDuration = Math.max(1, Date.now() - recordStartTimeRef.current);
      const firstInstrument = getKeyboardInstrument(notes[0]?.instrumentId ?? keyboardInstrumentModeRef.current);
      const buffer = await renderKeyboardRecordingBuffer(notes, totalDuration);
      const newSound: SoundDef = {
        id: `keyboard-${Date.now()}`,
        name: `${firstInstrument.name} Keys ${recordedSounds.filter(s => s.id.startsWith('keyboard-')).length + 1}`,
        category: 'custom',
        color: firstInstrument.color,
        pattern: [{ note: 1 }, ...new Array(15).fill({})],
        buffer,
        loopMode: 'full',
        playMode: 'buffer'
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
    if (isRecordingKeyboardRef.current) {
      const event = {
        time: Date.now(),
        note,
        instrumentId: keyboardInstrumentModeRef.current,
        sustain: keyboardSustainRef.current,
      };
      recordedNotesRef.current = [...recordedNotesRef.current, event];
      setRecordedNotes(recordedNotesRef.current);
    }
  };


  return {
    isKeyboardVisible,
    setIsKeyboardVisible,
    isRecordingKeyboard,
    keyboardInstrumentMode,
    setKeyboardInstrumentMode,
    isKeyboardSustainEnabled,
    setIsKeyboardSustainEnabled,
    recordedNotes,
    pressedKeyboardNotes,
    activeLiveFx,
    liveFxControls,
    setLiveFxControls,
    triggerLiveFx,
    startKeyboardRecording,
    stopKeyboardRecording,
    handleKeyboardNoteDown,
    handleKeyboardNoteUp,
  };
}
