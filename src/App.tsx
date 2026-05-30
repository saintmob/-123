import React, { useState, useEffect, useRef } from 'react';
import { AVAILABLE_SOUNDS, type AudioStyleId, type SoundDef, engineManager, type FxParams, defaultFx } from './audio';
import { cn } from './lib/utils';
import { createShowControlClient, type ControlCommand } from './lib/showControlClient';
import { SHOW_CLIENT_ID } from './lib/runtimeConfig';
import { ShowRuntimeSettingsPanel } from './components/ShowRuntimeSettingsPanel';
import { useKeyboardLiveFx } from './hooks/useKeyboardLiveFx';
import { useTimelineEditor } from './hooks/useTimelineEditor';
import {
  BPM_PRESETS,
  CLIP_COLOR_CLASSES,
  COLOR_MODE_STORAGE_KEY,
  DEFAULT_TIMELINE_SECONDS,
  DJ_AUDIO_ROUTE,
  KEYBOARD_INSTRUMENT_MODES,
  MAIN_PERSISTENCE_KEY,
  MUSICARR_FILE_MIME,
  PERSISTENCE_STATE_VERSION,
  PERSISTENCE_SYNC_CHANNEL,
  PERSISTENCE_SYNC_STORAGE_KEY,
  STORAGE_KEY,
  STYLE_PRESETS,
  TIMELINE_TRACKS,
  audioStyleForPreset,
  buildMixerTelemetry,
  clampUnit,
  cloneTabForRecording,
  createCodexSongTab,
  createIdFragment,
  createStyleTab,
  deletePersistedSnapshot,
  emitPersistenceSync,
  getAppRouteFromPath,
  getInternalRecordingMimeType,
  hydrateColorMode,
  hydrateSavedTabs,
  isQuotaExceededError,
  makeFx,
  readPersistedSnapshot,
  renderArrangementBuffer,
  sanitizeMusicarrFileName,
  writePersistedSnapshot,
  type AppRoute,
  type ArrangementEvent,
  type ArrangementFileHandle,
  type ArrangementFilePermissionMode,
  type AudioTransportState,
  type ColorMode,
  type GlobalRecordingState,
  type MixerAudioTelemetry,
  type PersistedSnapshot,
  type PersistenceSyncMessage,
  type TabData,
  type TimelineClip,
  type ViewMode,
  type WindowWithArrangementFilePicker,
} from './app/model';
import {
  deserializeSoundDef,
  serializeSoundDef,
  serializeSoundDefForPersistence,
  type MusicArrFile,
  type PersistedMainEditorState,
} from './app/mainPersistence';

const DJAudioEditorPage = React.lazy(() => import('./components/DJAudioEditorPage').then(module => ({ default: module.DJAudioEditorPage })));
const FxOverlayPanels = React.lazy(() => import('./components/FxOverlayPanels').then(module => ({ default: module.FxOverlayPanels })));
const FloatingKeyboard = React.lazy(() => import('./components/FloatingKeyboard').then(module => ({ default: module.FloatingKeyboard })));
const PerformanceMatrix = React.lazy(() => import('./components/PerformanceMatrix').then(module => ({ default: module.PerformanceMatrix })));
const SampleLibrary = React.lazy(() => import('./components/SampleLibrary').then(module => ({ default: module.SampleLibrary })));
const TimelinePage = React.lazy(() => import('./components/TimelinePage').then(module => ({ default: module.TimelinePage })));
const WorkbenchControls = React.lazy(() => import('./components/WorkbenchControls').then(module => ({ default: module.WorkbenchControls })));
const WorkbenchHeader = React.lazy(() => import('./components/WorkbenchHeader').then(module => ({ default: module.WorkbenchHeader })));

export default function App() {
  const [initialWorkbench] = useState(hydrateSavedTabs);
  const [tabs, setTabs] = useState<TabData[]>(() => initialWorkbench?.tabs ?? [createCodexSongTab()]);
  const [selectedStyleId, setSelectedStyleId] = useState(initialWorkbench?.styleId ?? STYLE_PRESETS[0].id);
  const [colorMode, setColorMode] = useState<ColorMode>(hydrateColorMode);
  const [pendingPlayIds, setPendingPlayIds] = useState<Set<string>>(() => new Set());
  const [appRoute, setAppRoute] = useState<AppRoute>(getAppRouteFromPath);
  const [isMainPersistenceReady, setIsMainPersistenceReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('matrix');
  const [isGlobalRecording, setIsGlobalRecording] = useState(false);
  const [globalRecordingState, setGlobalRecordingState] = useState<GlobalRecordingState>('idle');
  const [arrangementEvents, setArrangementEvents] = useState<ArrangementEvent[]>([]);
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
  const fxTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [hoveredTabFxId, setHoveredTabFxId] = useState<string | null>(null);
  const tabFxTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Recording & Upload states
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSounds, setRecordedSounds] = useState<SoundDef[]>([]);
  const getSoundById = (id: string) => recordedSounds.find(sound => sound.id === id) || AVAILABLE_SOUNDS.find(sound => sound.id === id);
  const {
    timelineClips,
    setTimelineClips,
    selectedTimelineClipId,
    setSelectedTimelineClipId,
    timelineDeleteHistory,
    setTimelineDeleteHistory,
    timelinePlayhead,
    setTimelinePlayhead,
    isTimelinePlaying,
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
  } = useTimelineEditor({ recordedSounds, getSoundById });
  const [isExtraLibraryOpen, setIsExtraLibraryOpen] = useState(false);
  const [openExtraCategories, setOpenExtraCategories] = useState<Record<string, boolean>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [isExportingArrangement, setIsExportingArrangement] = useState(false);
  const globalRecordStartedAtRef = useRef<number>(0);
  const globalRecorderRef = useRef<MediaRecorder | null>(null);
  const globalRecordChunksRef = useRef<Blob[]>([]);
  const globalRecordingStateRef = useRef<GlobalRecordingState>('idle');
  const globalRecordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startGlobalRecordingRef = useRef<() => void>(() => {});
  const stopGlobalRecordingRef = useRef<() => void>(() => {});
  const mainPersistenceSourceIdRef = useRef(`main-${createIdFragment()}`);
  const mainPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedMainPersistenceRef = useRef(false);
  const isApplyingMainPersistenceRef = useRef(false);
  const lastMainPersistenceUpdateRef = useRef(0);
  const mainQuotaWarningShownRef = useRef(false);

  const {
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
  } = useKeyboardLiveFx({ recordedSounds, setRecordedSounds });
  const showControlRef = useRef<ReturnType<typeof createShowControlClient> | null>(null);
  const showControlClientIdRef = useRef(SHOW_CLIENT_ID || `dj-music-editor-${createIdFragment()}`);
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
    const handlePopState = () => setAppRoute(getAppRouteFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    readPersistedSnapshot<PersistedMainEditorState>(MAIN_PERSISTENCE_KEY).then(async (snapshot) => {
      if (cancelled) return;
      if (snapshot) {
        await applyMainPersistedState(snapshot);
      }
      hasHydratedMainPersistenceRef.current = true;
      setIsMainPersistenceReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSyncMessage = async (message: PersistenceSyncMessage) => {
      if (message.key !== MAIN_PERSISTENCE_KEY || message.sourceId === mainPersistenceSourceIdRef.current) return;
      if (message.updatedAt <= lastMainPersistenceUpdateRef.current) return;
      if (message.cleared) {
        lastMainPersistenceUpdateRef.current = message.updatedAt;
        const fresh = createCodexSongTab();
        setRecordedSounds([]);
        setTimelineClips([]);
        setTimelineDeleteHistory([]);
        setSelectedTimelineClipId(null);
        setTimelinePlayhead(0);
        timelinePlayheadRef.current = 0;
        timelineOffsetRef.current = 0;
        setTimelineLoopRange({ start: 0, end: 8 });
        setTimelineDuration(DEFAULT_TIMELINE_SECONDS);
        setTabs([fresh]);
        setActiveTabId(fresh.id);
        setSelectedStyleId(STYLE_PRESETS[0].id);
        setViewMode('matrix');
        engineManager.bpm = 120;
        setBpm(120);
        setIsKeyboardSustainEnabled(false);
        syncProjectEngine(fresh);
        return;
      }

      const snapshot = await readPersistedSnapshot<PersistedMainEditorState>(MAIN_PERSISTENCE_KEY);
      if (snapshot && snapshot.updatedAt > lastMainPersistenceUpdateRef.current) {
        await applyMainPersistedState(snapshot);
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
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
  }, [colorMode]);

  const syncProjectEngine = (tab: TabData) => {
    const engine = engineManager.getProject(tab.id);
    engine.setStyle(tab.styleId);
    engine.setSlots(tab.slots);
    engine.setMutedSlots(tab.mutedSlots);
    tab.fxSlots.forEach((fx, index) => engine.setFxParams(index, fx));
    engine.setMasterFxParams(tab.masterFx);
  };

  const extraCategories: { id: string; name: string }[] = [];

  const navigateAppRoute = (route: AppRoute) => {
    const nextPath = route === 'dj' ? DJ_AUDIO_ROUTE : '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setAppRoute(route);
  };

  const applyBpmPreset = (nextBpm: number) => {
    const normalizedBpm = BPM_PRESETS.includes(nextBpm) ? nextBpm : 120;
    engineManager.bpm = normalizedBpm;
    setBpm(normalizedBpm);
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
    setRecordedSounds([]);
    setTimelineClips([]);
    setTimelineDeleteHistory([]);
    setSelectedTimelineClipId(null);
    setTimelinePlayhead(0);
    timelinePlayheadRef.current = 0;
    timelineOffsetRef.current = 0;
    setTimelineLoopRange({ start: 0, end: 8 });
    setTimelineDuration(DEFAULT_TIMELINE_SECONDS);
    setViewMode('matrix');
    engineManager.bpm = 120;
    setBpm(120);
    setIsKeyboardSustainEnabled(false);
    syncProjectEngine(fresh);
    window.localStorage.removeItem(STORAGE_KEY);
    clearMainPersistence();
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
      bpm,
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
        keyboardSustainEnabled: isKeyboardSustainEnabled,
        isKeyboardVisible,
      },
	    };
	  };

	  const createMainPersistenceData = async (includeAudio: boolean): Promise<PersistedMainEditorState> => {
	    const tabsPayload = await Promise.all(tabs.map(async (tab) => ({
	      id: tab.id,
	      name: tab.name,
	      slots: await Promise.all(tab.slots.map((slot) => slot ? serializeSoundDefForPersistence(slot, includeAudio) : null)),
	      mutedSlots: tab.mutedSlots,
	      moduleFx: tab.fxSlots,
	      masterFx: tab.masterFx,
	      styleId: tab.styleId,
	      activeStep: 0,
	      isPlaying: false,
	    })));

	    const recordedPayload = await Promise.all(recordedSounds.map(sound => serializeSoundDefForPersistence(sound, includeAudio)));

	    return {
	      selectedStyleId,
	      activeTabId,
	      viewMode,
	      bpm,
	      tabs: tabsPayload,
	      recordedSounds: recordedPayload,
	      timeline: {
	        duration: timelineDuration,
	        playhead: timelinePlayheadRef.current,
	        loopRange: timelineLoopRange,
	        clips: timelineClips,
	        selectedClipId: selectedTimelineClipId,
	      },
	      keyboard: {
	        instrumentMode: keyboardInstrumentMode,
	        isVisible: isKeyboardVisible,
	        sustain: isKeyboardSustainEnabled,
	      },
	      library: {
	        isExtraOpen: isExtraLibraryOpen,
	        openExtraCategories,
	      },
	    };
	  };

	  const applyMainPersistedState = async (snapshot: PersistedSnapshot<PersistedMainEditorState>) => {
	    isApplyingMainPersistenceRef.current = true;
	    try {
	      const data = snapshot.data;
	      const importedRecordedSounds = await Promise.all((data.recordedSounds || []).map(deserializeSoundDef));
	      const importedTabs = await Promise.all((data.tabs || []).map(async (tab) => ({
	        id: tab.id,
	        name: tab.name,
	        slots: await Promise.all(tab.slots.map((slot) => slot ? deserializeSoundDef(slot) : null)),
	        mutedSlots: tab.mutedSlots,
	        fxSlots: tab.moduleFx ?? tab.fxSlots ?? new Array(7).fill(null).map(defaultFx),
	        masterFx: tab.masterFx,
	        styleId: tab.styleId ?? 'default',
	        isPlaying: false,
	        activeStep: 0,
	      })));

	      if (!importedTabs.length) return;
	      const nextDuration = Math.max(1, Math.min(600, Number(data.timeline?.duration) || DEFAULT_TIMELINE_SECONDS));
	      const nextLoopStart = Math.max(0, Math.min(data.timeline?.loopRange?.start ?? 0, nextDuration - 0.25));
	      const nextLoopEnd = Math.max(nextLoopStart + 0.25, Math.min(data.timeline?.loopRange?.end ?? Math.min(8, nextDuration), nextDuration));
	      const nextPlayhead = Math.max(0, Math.min(data.timeline?.playhead ?? nextLoopStart, nextDuration));
	      const nextClips = (data.timeline?.clips || []).map((clip) => {
	        const duration = Math.max(0.5, Math.min(clip.duration, nextDuration));
	        return {
	          ...clip,
	          track: Math.max(0, Math.min(TIMELINE_TRACKS - 1, clip.track)),
	          start: Math.max(0, Math.min(clip.start, Math.max(0, nextDuration - duration))),
	          duration,
	          trimStart: Math.max(0, clip.trimStart),
	        };
	      });

	      setRecordedSounds(importedRecordedSounds);
	      setTabs(importedTabs);
	      setSelectedStyleId(data.selectedStyleId || STYLE_PRESETS[0].id);
	      setActiveTabId(importedTabs.some(tab => tab.id === data.activeTabId) ? data.activeTabId : importedTabs[0].id);
	      setViewMode(data.viewMode || 'matrix');
	      const nextBpm = Math.max(40, Math.min(240, Number(data.bpm) || engineManager.bpm));
	      engineManager.bpm = nextBpm;
	      setBpm(nextBpm);
	      setKeyboardInstrumentMode(data.keyboard?.instrumentMode || KEYBOARD_INSTRUMENT_MODES[0].id);
	      setIsKeyboardSustainEnabled(Boolean(data.keyboard?.sustain));
	      setIsKeyboardVisible(Boolean(data.keyboard?.isVisible));
	      setIsExtraLibraryOpen(Boolean(data.library?.isExtraOpen));
	      setOpenExtraCategories(data.library?.openExtraCategories || {});
	      setTimelineDuration(nextDuration);
	      setTimelineLoopRange({ start: nextLoopStart, end: nextLoopEnd });
	      setTimelinePlayhead(nextPlayhead);
	      timelinePlayheadRef.current = nextPlayhead;
	      timelineOffsetRef.current = nextPlayhead;
	      setTimelineClips(nextClips);
	      setTimelineDeleteHistory([]);
	      setSelectedTimelineClipId(data.timeline?.selectedClipId ?? null);

	      importedTabs.forEach((tab) => {
	        const engine = engineManager.getProject(tab.id);
	        engine.setStyle(tab.styleId);
	        engine.setSlots(tab.slots);
	        engine.setMutedSlots(tab.mutedSlots);
	        tab.fxSlots.forEach((fx, index) => engine.setFxParams(index, fx));
	        engine.setMasterFxParams(tab.masterFx);
	      });
	      lastMainPersistenceUpdateRef.current = snapshot.updatedAt;
	    } finally {
	      isApplyingMainPersistenceRef.current = false;
	    }
	  };

	  const persistMainEditorState = async (includeAudio = true) => {
	    if (!hasHydratedMainPersistenceRef.current || isApplyingMainPersistenceRef.current) return;
	    const updatedAt = Date.now();
	    try {
	      const data = await createMainPersistenceData(includeAudio);
	      const snapshot: PersistedSnapshot<PersistedMainEditorState> = {
	        version: PERSISTENCE_STATE_VERSION,
	        updatedAt,
	        data,
	        degraded: !includeAudio,
	      };
	      await writePersistedSnapshot(MAIN_PERSISTENCE_KEY, snapshot);
	      lastMainPersistenceUpdateRef.current = updatedAt;
	      emitPersistenceSync({ key: MAIN_PERSISTENCE_KEY, updatedAt, sourceId: mainPersistenceSourceIdRef.current });
	    } catch (err) {
	      if (includeAudio && isQuotaExceededError(err)) {
	        if (!mainQuotaWarningShownRef.current) {
	          mainQuotaWarningShownRef.current = true;
	          alert('浏览器本地存储空间不足，已优先保留最新编排、时间线和参数；部分录音素材可能无法完整缓存。');
	        }
	        await persistMainEditorState(false);
	        return;
	      }
	      console.error('Main editor persistence failed', err);
	    }
	  };

	  const queueMainPersistence = () => {
	    if (!hasHydratedMainPersistenceRef.current || isApplyingMainPersistenceRef.current) return;
	    if (mainPersistTimerRef.current) clearTimeout(mainPersistTimerRef.current);
	    mainPersistTimerRef.current = setTimeout(() => {
	      mainPersistTimerRef.current = null;
	      persistMainEditorState();
	    }, 800);
	  };

	  const clearMainPersistence = async (emit = true) => {
	    if (mainPersistTimerRef.current) {
	      clearTimeout(mainPersistTimerRef.current);
	      mainPersistTimerRef.current = null;
	    }
	    const updatedAt = Date.now();
	    lastMainPersistenceUpdateRef.current = updatedAt;
	    await deletePersistedSnapshot(MAIN_PERSISTENCE_KEY);
	    if (emit) {
	      emitPersistenceSync({ key: MAIN_PERSISTENCE_KEY, updatedAt, sourceId: mainPersistenceSourceIdRef.current, cleared: true });
	    }
	  };

	  const createMusicarrText = async () => {
    const payload = await createMusicarrPayload();
    return JSON.stringify(payload, null, 2);
  };

  const createSuggestedExportFileName = () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    return sanitizeMusicarrFileName(`${activeTab?.name || 'arrangement'}-${timestamp}`);
  };

  const downloadMusicarrFile = (text: string, fileName: string) => {
    const blob = new Blob([text], { type: MUSICARR_FILE_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const ensureArrangementFilePermission = async (handle: ArrangementFileHandle) => {
    if (!handle.queryPermission || !handle.requestPermission) return true;

    const descriptor = { mode: 'readwrite' as ArrangementFilePermissionMode };
    const currentPermission = await handle.queryPermission(descriptor);
    if (currentPermission === 'granted') return true;
    const nextPermission = await handle.requestPermission(descriptor);
    return nextPermission === 'granted';
  };

  const writeArrangementFile = async (handle: ArrangementFileHandle, text: string) => {
    const hasPermission = await ensureArrangementFilePermission(handle);
    if (!hasPermission) throw new Error('file-permission-denied');

    const writable = await handle.createWritable();
    await writable.write(new Blob([text], { type: MUSICARR_FILE_MIME }));
    await writable.close();
  };

  const isPickerAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

  const handleExportArrangement = async () => {
    if (isExportingArrangement) return;
    setIsExportingArrangement(true);

    try {
      const text = await createMusicarrText();
      const suggestedName = createSuggestedExportFileName();
      const saveFilePicker = (window as WindowWithArrangementFilePicker).showSaveFilePicker;

      if (saveFilePicker) {
        const handle = await saveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Music Arrangement',
              accept: {
                [MUSICARR_FILE_MIME]: ['.musicarr'],
              },
            },
          ],
        });
        await writeArrangementFile(handle, text);
        return;
      }

      const fallbackName = window.prompt('请输入导出文件名', suggestedName);
      if (!fallbackName) return;
      const fileName = sanitizeMusicarrFileName(fallbackName);
      downloadMusicarrFile(text, fileName);
    } catch (err) {
      if (isPickerAbort(err)) return;
      console.error('Export failed', err);
      alert('导出失败，请重试。');
    } finally {
      setIsExportingArrangement(false);
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
      const nextBpm = Math.max(40, Math.min(240, Number(data.bpm) || 120));
      engineManager.bpm = nextBpm;
      setBpm(nextBpm);
      setKeyboardInstrumentMode(data.userSettings?.keyboardInstrumentMode || KEYBOARD_INSTRUMENT_MODES[0].id);
      setIsKeyboardSustainEnabled(Boolean(data.userSettings?.keyboardSustainEnabled));
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
        setTimelineDeleteHistory([]);
        setSelectedTimelineClipId(data.timeline.selectedClipId ?? null);
      } else {
        setTimelineClips([]);
        setTimelineDeleteHistory([]);
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
    <React.Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">Loading timeline</div>}>
      <TimelinePage
        isDayMode={isDayMode}
        mutedTextClass={mutedTextClass}
        softButtonClass={softButtonClass}
        recordedSounds={recordedSounds}
        timelineDuration={timelineDuration}
        timelineGridRef={timelineGridRef}
        timelineLoopRange={timelineLoopRange}
        timelinePlayhead={timelinePlayhead}
        timelineClips={timelineClips}
        selectedTimelineClipId={selectedTimelineClipId}
        timelineDeleteHistory={timelineDeleteHistory}
        isTimelinePlaying={isTimelinePlaying}
        clearRecordedSounds={clearRecordedSounds}
        deleteRecordedSound={deleteRecordedSound}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleTimelineDurationChange={handleTimelineDurationChange}
        rewindTimeline={rewindTimeline}
        pauseTimeline={pauseTimeline}
        playTimeline={playTimeline}
        jumpTimelineToEnd={jumpTimelineToEnd}
        beginTimelineTransportEdit={beginTimelineTransportEdit}
        handleTimelineDrop={handleTimelineDrop}
        handleTimelineSurfacePointerDown={handleTimelineSurfacePointerDown}
        getSoundById={getSoundById}
        beginTimelineEdit={beginTimelineEdit}
        selectTimelineClip={setSelectedTimelineClipId}
        duplicateTimelineClip={duplicateTimelineClip}
        cropTimelineClip={cropTimelineClip}
        deleteSelectedTimelineClip={deleteSelectedTimelineClip}
        undoTimelineDelete={undoTimelineDelete}
      />
    </React.Suspense>
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
        const newMode: NonNullable<SoundDef['loopMode']> = slot.loopMode === 'fast' ? 'full' : 'fast';
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

	  useEffect(() => {
	    queueMainPersistence();
	  }, [
	    tabs,
	    selectedStyleId,
	    activeTabId,
	    viewMode,
	    bpm,
	    recordedSounds,
	    timelineClips,
	    selectedTimelineClipId,
	    timelinePlayhead,
	    timelineDuration,
	    timelineLoopRange,
	    keyboardInstrumentMode,
	    isKeyboardSustainEnabled,
	    isKeyboardVisible,
	    isExtraLibraryOpen,
	    openExtraCategories,
	  ]);

	  useEffect(() => () => {
	    if (mainPersistTimerRef.current) clearTimeout(mainPersistTimerRef.current);
	  }, []);

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
	  if (!isMainPersistenceReady && appRoute !== 'dj') {
	    return (
	      <div className="flex h-screen items-center justify-center bg-[#0c0c0e] text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">
	        Loading local session
	      </div>
	    );
	  }

	  return (
    <>
    <ShowRuntimeSettingsPanel status={showControlStatus} clientIdRequired />
	    <div
      className={cn(
        "h-screen font-sans flex flex-col overflow-hidden select-none transition-colors duration-300",
        isDayMode ? "bg-slate-100 text-slate-700" : "bg-[#0c0c0e] text-zinc-300",
        appRoute === 'dj' && "hidden"
      )}
      style={{
        background: isDayMode
          ? `linear-gradient(180deg, #f8fafc 0%, #eef4f8 58%, rgba(255,255,255,0.8) 100%)`
          : `linear-gradient(180deg, #0c0c0e 0%, #101014 58%, ${activeStyle.panel} 100%)`,
      }}
    >
      <React.Suspense fallback={<div className="flex flex-1 items-center justify-center text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">Loading workbench</div>}>
      <WorkbenchHeader
        tabs={tabs}
        activeTabId={activeTabId}
        pendingPlayIds={pendingPlayIds}
        isDayMode={isDayMode}
        isKeyboardVisible={isKeyboardVisible}
        isExportingArrangement={isExportingArrangement}
        importFileInputRef={importFileInputRef}
        globalRecordingState={globalRecordingState}
        globalRecordTitle={globalRecordTitle}
        globalRecordLabel={globalRecordLabel}
        arrangementEventCount={arrangementEvents.length}
        viewMode={viewMode}
        onActivateTab={setActiveTabId}
        onTabMouseEnter={handleTabMouseEnter}
        onTabMouseLeave={handleTabMouseLeave}
        onTogglePlayTab={togglePlayTab}
        onDeleteTab={deleteTab}
        onAddNewTab={addNewTab}
        onExportArrangement={handleExportArrangement}
        onImportArrangement={handleImportArrangement}
        onOpenDj={() => navigateAppRoute('dj')}
        onOpenKeyboard={() => setIsKeyboardVisible(true)}
        onClearActiveTab={handleClearActiveTab}
        onGlobalRecordingToggle={handleGlobalRecordingToggle}
        onToggleViewMode={() => setViewMode(prev => prev === 'timeline' ? 'matrix' : 'timeline')}
      />

      {viewMode === 'timeline' ? renderTimelinePage() : (
      <>
      {/* Main Content Area */}
      <main className="min-h-0 flex-1 w-full flex flex-col p-6 gap-5 overflow-hidden">
        <WorkbenchControls
          activeTab={activeTab}
          selectedStyleId={selectedStyleId}
          bpm={bpm}
          isDayMode={isDayMode}
          mutedTextClass={mutedTextClass}
          hairlineClass={hairlineClass}
          softButtonClass={softButtonClass}
          onApplyStylePreset={applyStylePreset}
          onApplyBpmPreset={applyBpmPreset}
          onShuffleActiveTab={shuffleActiveTab}
          onReverseActiveTab={reverseActiveTab}
          onResetWorkbench={resetWorkbench}
          onToggleColorMode={() => setColorMode(prev => prev === 'night' ? 'day' : 'night')}
          onStyleChange={handleStyleChange}
        />
        <PerformanceMatrix
          activeTab={activeTab}
          activeStyle={activeStyle}
          workbenchStyle={workbenchStyle}
          isDayMode={isDayMode}
          mutedTextClass={mutedTextClass}
          beatEnergy={beatEnergy}
          downbeat={downbeat}
          sweepPosition={sweepPosition}
          rhythmWave={rhythmWave}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onToggleMute={toggleMute}
          onModuleMouseEnter={handleModuleMouseEnter}
          onModuleMouseLeave={handleModuleMouseLeave}
          onClearSlot={handleClearSlot}
        />

        <FxOverlayPanels
          activeTab={activeTab}
          tabs={tabs}
          hoveredFxSlot={hoveredFxSlot}
          hoveredTabFxId={hoveredTabFxId}
          fxConfig={fxConfig}
          onSlotPanelMouseEnter={() => clearTimeout(fxTimeoutRef.current)}
          onSlotPanelMouseLeave={handleModuleMouseLeave}
          onTabPanelMouseEnter={() => clearTimeout(tabFxTimeoutRef.current)}
          onTabPanelMouseLeave={handleTabMouseLeave}
          onResetFx={handleResetFx}
          onResetMasterFx={handleResetMasterFx}
          onFxChange={handleFxChange}
          onMasterFxChange={handleMasterFxChange}
        />

        <SampleLibrary
          isDayMode={isDayMode}
          hairlineClass={hairlineClass}
          mutedTextClass={mutedTextClass}
          bpm={bpm}
          isRecording={isRecording}
          recordedSounds={recordedSounds}
          isExtraLibraryOpen={isExtraLibraryOpen}
          openExtraCategories={openExtraCategories}
          fileInputRef={fileInputRef}
          onFileUpload={handleFileUpload}
          onUploadClick={() => fileInputRef.current?.click()}
          onToggleRecording={isRecording ? stopRecording : startRecording}
          onDragStart={handleDragStart}
          onToggleLoopMode={toggleLoopMode}
          onExtraLibraryOpenChange={setIsExtraLibraryOpen}
          onOpenExtraCategoriesChange={setOpenExtraCategories}
        />
        
      </main>
      </>
      )}
      </React.Suspense>
    </div>

      <React.Suspense fallback={null}>
        <FloatingKeyboard
          isVisible={isKeyboardVisible}
          keyboardInstrumentMode={keyboardInstrumentMode}
          isRecordingKeyboard={isRecordingKeyboard}
          isKeyboardSustainEnabled={isKeyboardSustainEnabled}
          pressedKeyboardNotes={pressedKeyboardNotes}
          activeLiveFx={activeLiveFx}
          liveFxControls={liveFxControls}
          recordedNotes={recordedNotes}
          onClose={() => setIsKeyboardVisible(false)}
          onInstrumentModeChange={setKeyboardInstrumentMode}
          onToggleKeyboardRecording={isRecordingKeyboard ? stopKeyboardRecording : startKeyboardRecording}
          onToggleSustain={() => setIsKeyboardSustainEnabled(prev => !prev)}
          onKeyboardNoteDown={handleKeyboardNoteDown}
          onKeyboardNoteUp={handleKeyboardNoteUp}
          onLiveFxControlsChange={setLiveFxControls}
          onTriggerLiveFx={triggerLiveFx}
        />
      </React.Suspense>
    <div className={appRoute === 'dj' ? 'fixed inset-0 z-[100] block' : 'hidden'}>
      <React.Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#08090b] text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">Loading DJ editor</div>}>
        <DJAudioEditorPage onBack={() => navigateAppRoute('main')} />
      </React.Suspense>
    </div>
    </>
  );
}
