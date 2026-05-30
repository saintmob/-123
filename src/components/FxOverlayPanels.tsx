import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { FxParams } from '../audio';
import type { TabData } from '../app/model';

interface FxControlConfig {
  key: keyof FxParams;
  name: string;
  min: number;
  max: number;
}

interface FxOverlayPanelsProps {
  activeTab: TabData;
  tabs: TabData[];
  hoveredFxSlot: number | null;
  hoveredTabFxId: string | null;
  fxConfig: FxControlConfig[];
  onSlotPanelMouseEnter: () => void;
  onSlotPanelMouseLeave: () => void;
  onTabPanelMouseEnter: () => void;
  onTabPanelMouseLeave: () => void;
  onResetFx: () => void;
  onResetMasterFx: () => void;
  onFxChange: (key: keyof FxParams, value: number) => void;
  onMasterFxChange: (key: keyof FxParams, value: number) => void;
}

export function FxOverlayPanels({
  activeTab,
  tabs,
  hoveredFxSlot,
  hoveredTabFxId,
  fxConfig,
  onSlotPanelMouseEnter,
  onSlotPanelMouseLeave,
  onTabPanelMouseEnter,
  onTabPanelMouseLeave,
  onResetFx,
  onResetMasterFx,
  onFxChange,
  onMasterFxChange,
}: FxOverlayPanelsProps) {
  const activeSlot = hoveredFxSlot === null ? null : activeTab.slots[hoveredFxSlot];

  return (
    <>
      <AnimatePresence>
        {hoveredFxSlot !== null && activeSlot && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onMouseEnter={onSlotPanelMouseEnter}
            onMouseLeave={onSlotPanelMouseLeave}
            className="absolute z-50 left-0 right-0 top-[50%] lg:top-[60%] mx-auto w-[95%] max-w-5xl bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-5 pointer-events-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Module FX: {activeSlot.name} (Slot {hoveredFxSlot + 1})
                </h3>
                <button
                  onClick={onResetFx}
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
                    onChange={(event) => onFxChange(cfg.key, parseFloat(event.target.value))}
                    className="w-full h-1.5 focus:outline-none appearance-none bg-zinc-800 rounded-lg cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full"
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hoveredTabFxId !== null && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onMouseEnter={onTabPanelMouseEnter}
            onMouseLeave={onTabPanelMouseLeave}
            className="absolute z-50 left-0 right-0 top-16 mx-auto w-[95%] max-w-5xl bg-indigo-950/95 backdrop-blur-xl border border-indigo-500/30 rounded-b-2xl p-6 shadow-2xl flex flex-col gap-5 pointer-events-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2 text-indigo-300">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  Master FX: {tabs.find(tab => tab.id === hoveredTabFxId)?.name}
                </h3>
                <button
                  onClick={onResetMasterFx}
                  className="px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-[9px] font-bold text-indigo-300 uppercase tracking-tighter transition-colors border border-indigo-500/30"
                >
                  Reset Global
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-6">
              {fxConfig.map(cfg => {
                const tab = tabs.find(item => item.id === hoveredTabFxId);
                if (!tab) return null;
                return (
                  <div key={cfg.key} className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-indigo-300/80 uppercase tracking-wider">{cfg.name}</span>
                      <span className="text-[10px] text-indigo-200 font-mono bg-indigo-900/50 px-1.5 py-0.5 rounded flex-shrink-0 min-w-[28px] text-center">
                        {tab.masterFx[cfg.key]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={cfg.min}
                      max={cfg.max}
                      value={tab.masterFx[cfg.key]}
                      onChange={(event) => onMasterFxChange(cfg.key, parseFloat(event.target.value))}
                      className="w-full h-1.5 focus:outline-none appearance-none bg-indigo-950/50 rounded-lg cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-full outline border border-indigo-800/50"
                    />
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
