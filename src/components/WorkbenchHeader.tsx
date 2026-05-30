import { Circle, Disc3, Keyboard, ListMusic, Play, Plus, SkipBack, Square, Trash2, X } from 'lucide-react';
import type React from 'react';
import { cn } from '../lib/utils';
import type { GlobalRecordingState, TabData, ViewMode } from '../app/model';

interface WorkbenchHeaderProps {
  tabs: TabData[];
  activeTabId: string;
  pendingPlayIds: Set<string>;
  isDayMode: boolean;
  isKeyboardVisible: boolean;
  isExportingArrangement: boolean;
  importFileInputRef: React.RefObject<HTMLInputElement | null>;
  globalRecordingState: GlobalRecordingState;
  globalRecordTitle: string;
  globalRecordLabel: string | number;
  arrangementEventCount: number;
  viewMode: ViewMode;
  onActivateTab: (tabId: string) => void;
  onTabMouseEnter: (tabId: string) => void;
  onTabMouseLeave: () => void;
  onTogglePlayTab: (event: React.MouseEvent<HTMLButtonElement>, tabId: string) => void;
  onDeleteTab: (event: React.MouseEvent<HTMLButtonElement>, tabId: string) => void;
  onAddNewTab: () => void;
  onExportArrangement: () => void;
  onImportArrangement: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenDj: () => void;
  onOpenKeyboard: () => void;
  onClearActiveTab: () => void;
  onGlobalRecordingToggle: () => void;
  onToggleViewMode: () => void;
}

export function WorkbenchHeader({
  tabs,
  activeTabId,
  pendingPlayIds,
  isDayMode,
  isKeyboardVisible,
  isExportingArrangement,
  importFileInputRef,
  globalRecordingState,
  globalRecordTitle,
  globalRecordLabel,
  arrangementEventCount,
  viewMode,
  onActivateTab,
  onTabMouseEnter,
  onTabMouseLeave,
  onTogglePlayTab,
  onDeleteTab,
  onAddNewTab,
  onExportArrangement,
  onImportArrangement,
  onOpenDj,
  onOpenKeyboard,
  onClearActiveTab,
  onGlobalRecordingToggle,
  onToggleViewMode,
}: WorkbenchHeaderProps) {
  return (
    <header
      className={cn(
        'px-4 sm:px-6 flex flex-shrink-0 items-end justify-between gap-3 border-b backdrop-blur-md z-10 w-full pt-4',
        isDayMode ? 'border-slate-900/10 bg-white/80' : 'border-white/5 bg-black/40',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none pb-0">
        {tabs.map((tab) => {
          const isQueued = pendingPlayIds.has(tab.id);
          return (
            <div
              key={tab.id}
              onClick={() => onActivateTab(tab.id)}
              onMouseEnter={() => onTabMouseEnter(tab.id)}
              onMouseLeave={onTabMouseLeave}
              className={cn(
                'group relative flex items-center gap-3 px-4 py-3 rounded-t-lg font-bold tracking-widest uppercase text-[10px] cursor-pointer transition-all border border-b-0 min-w-max',
                activeTabId === tab.id
                  ? isDayMode
                    ? 'bg-white border-slate-900/10 text-slate-950 shadow-sm'
                    : 'bg-zinc-900 border-white/10 text-white'
                  : isDayMode
                    ? 'bg-slate-900/5 border-transparent text-slate-500 hover:text-slate-900 hover:bg-white/70'
                    : 'bg-black/20 border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-black/40',
              )}
            >
              <button
                onClick={(event) => onTogglePlayTab(event, tab.id)}
                className={cn(
                  'w-5 h-5 rounded flex items-center justify-center transition-colors',
                  tab.isPlaying
                    ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : isQueued
                      ? 'bg-amber-500 text-white animate-pulse'
                      : isDayMode
                        ? 'bg-slate-900/10 text-slate-700 hover:bg-slate-900/15'
                        : 'bg-white/10 text-white hover:bg-white/20',
                )}
              >
                {tab.isPlaying || isQueued ? <Square className="w-2.5 h-2.5" fill="currentColor" /> : <Play className="w-2.5 h-2.5 ml-0.5" fill="currentColor" />}
              </button>
              <span>{tab.name}</span>
              <span className="flex gap-0.5 w-3 mt-0.5 opacity-80">
                {tab.isPlaying && (
                  <>
                    <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-pulse delay-75" />
                    <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-pulse delay-150" />
                  </>
                )}
              </span>
              <button
                onClick={(event) => onDeleteTab(event, tab.id)}
                aria-label={`Delete ${tab.name}`}
                title="Delete page"
                className={cn(
                  'ml-1 h-5 w-5 rounded-full flex items-center justify-center transition-colors opacity-60 group-hover:opacity-100',
                  isDayMode ? 'text-slate-400 hover:bg-slate-900/10 hover:text-slate-900' : 'text-zinc-500 hover:bg-white/10 hover:text-white',
                )}
              >
                <X className="w-3 h-3" strokeWidth={3} />
              </button>
            </div>
          );
        })}

        <button
          onClick={onAddNewTab}
          className={cn(
            'px-4 py-3 rounded-t-lg transition-colors uppercase tracking-widest text-[10px] font-bold border border-transparent flex items-center gap-1.5 ml-2',
            isDayMode ? 'bg-slate-900/5 hover:bg-white/80 text-slate-500 hover:text-slate-900' : 'bg-black/20 hover:bg-black/40 text-zinc-500 hover:text-zinc-300',
          )}
        >
          <Plus size={12} strokeWidth={3} />
          New
        </button>

        <button
          onClick={onExportArrangement}
          disabled={isExportingArrangement}
          className={cn(
            'px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all',
            isExportingArrangement ? 'bg-white/[0.03] text-zinc-700 cursor-wait' : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white',
          )}
        >
          {isExportingArrangement ? 'Exporting' : 'Export'}
        </button>
        <button
          onClick={() => importFileInputRef.current?.click()}
          className="px-3 py-2 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white text-[9px] font-bold uppercase tracking-widest transition-all"
        >
          Import
        </button>
        <button
          onClick={onOpenDj}
          aria-label="Open DJ audio editor"
          title="Open DJ audio editor"
          className="px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-100 text-[9px] font-bold uppercase tracking-widest transition-all inline-flex items-center gap-1.5"
        >
          <Disc3 size={12} strokeWidth={2.5} />
          DJ
        </button>
        <input
          type="file"
          accept=".musicarr,application/json"
          className="hidden"
          ref={importFileInputRef}
          onChange={onImportArrangement}
        />
        <button
          onClick={onOpenKeyboard}
          aria-label="Open keyboard"
          title="Open keyboard"
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-all border border-white/10 shadow-sm',
            isKeyboardVisible ? 'bg-emerald-500 text-white' : isDayMode ? 'bg-slate-900/5 text-slate-600 hover:bg-white hover:text-slate-950 border-slate-900/10' : 'bg-black/20 text-zinc-400 hover:bg-white/10 hover:text-white',
          )}
        >
          <Keyboard className="w-5 h-5" />
        </button>
        <button
          onClick={onClearActiveTab}
          aria-label="Clear current tab"
          title="Clear current tab"
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-all border shadow-sm',
            isDayMode ? 'bg-slate-900/5 text-slate-600 hover:bg-white hover:text-slate-950 border-slate-900/10' : 'bg-black/20 text-zinc-400 hover:bg-white/10 hover:text-white border-white/10',
          )}
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 pb-3">
        <button
          onClick={onGlobalRecordingToggle}
          aria-label={globalRecordTitle}
          title={globalRecordTitle}
          className={cn(
            'h-10 rounded-full border px-3 sm:px-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm',
            globalRecordingState === 'recording'
              ? 'bg-red-500 text-white border-red-400 animate-pulse shadow-[0_0_24px_rgba(239,68,68,0.28)]'
              : globalRecordingState === 'waiting'
                ? 'bg-zinc-600 text-zinc-200 border-zinc-500 cursor-wait'
                : globalRecordingState === 'stopping'
                  ? 'bg-zinc-800 text-red-200 border-red-500/40 cursor-wait'
                  : isDayMode
                    ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700'
                    : 'bg-white text-zinc-950 border-white hover:bg-zinc-200',
          )}
        >
          <Circle
            className={cn(
              'w-3.5 h-3.5',
              globalRecordingState === 'recording' ? 'fill-white text-white' : globalRecordingState === 'waiting' ? 'fill-zinc-300 text-zinc-300' : 'fill-red-500 text-red-500',
            )}
          />
          <span className="hidden sm:inline">{globalRecordLabel}</span>
          <span className="sm:hidden">{globalRecordingState === 'recording' ? arrangementEventCount : globalRecordLabel}</span>
        </button>
        <button
          onClick={onToggleViewMode}
          aria-label="Switch timeline view"
          title="Switch timeline view"
          className={cn(
            'h-10 rounded-full border px-3 sm:px-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm',
            viewMode === 'timeline'
              ? 'bg-emerald-500 text-white border-emerald-400'
              : isDayMode
                ? 'bg-slate-900/5 text-slate-600 hover:bg-white hover:text-slate-950 border-slate-900/10'
                : 'bg-black/20 text-zinc-400 hover:bg-white/10 hover:text-white border-white/10',
          )}
        >
          {viewMode === 'timeline' ? <SkipBack className="w-4 h-4" /> : <ListMusic className="w-4 h-4" />}
          <span className="hidden sm:inline">{viewMode === 'timeline' ? 'Matrix' : 'Timeline'}</span>
          <span className="sm:hidden">{viewMode === 'timeline' ? 'Back' : 'Line'}</span>
        </button>
      </div>
    </header>
  );
}
