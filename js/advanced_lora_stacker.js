/**
 * Advanced LoRA Stacker - Simplified State Management (v2)
 * Complete rewrite focusing on reliable state persistence
 */

import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

// Store reference to available LoRAs
let availableLoRAs = ["None"];
let loraListPromise = null;

/**
 * Fetch available LoRAs from ComfyUI
 */
async function fetchLoraList() {
    if (loraListPromise) return loraListPromise;
    
    loraListPromise = (async () => {
        try {
            const response = await fetch('/object_info/LoraLoader');
            const data = await response.json();
            
            if (data?.LoraLoader?.input?.required?.lora_name?.[0]) {
                availableLoRAs = ["None", ...data.LoraLoader.input.required.lora_name[0]];
            }
        } catch (error) {
            console.error("Failed to fetch LoRA list:", error);
        }
    })();
    
    return loraListPromise;
}

/**
 * Save state to localStorage as backup
 */
function saveStateToLocalStorage(nodeId, state) {
    try {
        const key = `AdvancedLoraStacker_${nodeId}`;
        localStorage.setItem(key, JSON.stringify(state));
        console.log(`[LoRA Stacker] Saved state to localStorage for node ${nodeId}`);
    } catch (e) {
        console.error("[LoRA Stacker] Failed to save to localStorage:", e);
    }
}

/**
 * Load state from localStorage
 */
function loadStateFromLocalStorage(nodeId) {
    try {
        const key = `AdvancedLoraStacker_${nodeId}`;
        const data = localStorage.getItem(key);
        if (data) {
            console.log(`[LoRA Stacker] Loaded state from localStorage for node ${nodeId}`);
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("[LoRA Stacker] Failed to load from localStorage:", e);
    }
    return null;
}

app.registerExtension({
    name: "advanced_lora_stacker.AdvancedLoraStacker",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "AdvancedLoraStacker") return;
        
        // Fetch LoRA list on load
        await fetchLoraList();
        
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            
            console.log("[LoRA Stacker] Node created, ID:", this.id);
            
            // Initialize state
            this.loraState = {
                groups: [],
                loras: []
            };
            this.nextGroupId = 1;
            this.nextLoraId = 1;
            this.collapsedGroups = new Set();
            
            // Set initial size
            this.setSize([450, 140]);
            
            // Find or create the stack_data widget (should exist from Python INPUT_TYPES)
            this.stackDataWidget = this.widgets.find(w => w.name === "stack_data");
            if (!this.stackDataWidget) {
                console.log("[LoRA Stacker] Creating stack_data widget");
                this.stackDataWidget = ComfyWidgets.STRING(this, "stack_data", ["STRING", {default: ""}], app).widget;
            }
            
            // Mark as hidden and ensure serialization
            this.stackDataWidget.type = "converted-widget";
            this.stackDataWidget.computeSize = () => [0, -4];
            this.stackDataWidget.serializeValue = () => {
                return this.stackDataWidget.value;
            };
            
            // Create main action buttons
            this.addLoraButton = this.addWidget("button", "➕ Add LoRA", null, () => {
                this.addLora(null);
            });
            
            this.addGroupButton = this.addWidget("button", "➕ Add Group", null, () => {
                this.addGroup();
            });
            
            // Save state whenever something changes
            this.saveState = () => {
                if (this._saving) return; // Prevent recursion
                this._saving = true;
                
                const stateJson = JSON.stringify(this.loraState);
                this.stackDataWidget.value = stateJson;
                
                // Also save to localStorage as backup
                if (this.id) {
                    saveStateToLocalStorage(this.id, this.loraState);
                }
                
                console.log("[LoRA Stacker] State saved:", stateJson.substring(0, 100) + "...");
                this._saving = false;
            };
            
            // Load state when node is configured (workflow loaded)
            const originalConfigure = this.onConfigure;
            this.onConfigure = (info) => {
                if (originalConfigure) {
                    originalConfigure.call(this, info);
                }
                
                console.log("[LoRA Stacker] onConfigure called");
                
                // Try to load from widget value first
                if (info.widgets_values) {
                    const stackDataIndex = this.widgets.findIndex(w => w.name === "stack_data");
                    if (stackDataIndex >= 0 && info.widgets_values[stackDataIndex]) {
                        const stateJson = info.widgets_values[stackDataIndex];
                        console.log("[LoRA Stacker] Loading from widgets_values:", stateJson.substring(0, 100) + "...");
                        this.stackDataWidget.value = stateJson;
                    }
                }
                
                // Restore UI from state
                this.restoreState();
            };
            
            // Ensure state is saved before serialization
            const originalGetWidgetValue = this.widgets[0].serializeValue || (() => this.widgets[0].value);
            if (this.stackDataWidget) {
                this.stackDataWidget.serializeValue = () => {
                    this.saveState();
                    return this.stackDataWidget.value;
                };
            }
            
            return r;
        };
        
        /**
         * Restore the UI from the current state
         */
        nodeType.prototype.restoreState = function() {
            if (!this.stackDataWidget?.value) {
                console.log("[LoRA Stacker] No state to restore");
                // Try loading from localStorage
                const localState = loadStateFromLocalStorage(this.id);
                if (localState) {
                    this.loraState = localState;
                    this.saveState();
                } else {
                    return;
                }
            }
            
            try {
                const state = JSON.parse(this.stackDataWidget.value);
                console.log("[LoRA Stacker] Restoring state:", state);
                
                // Clear existing UI (except base widgets)
                this.clearDynamicWidgets();
                
                // Update state
                this.loraState = state;
                
                // Rebuild UI from state
                this.rebuildUI();
                
            } catch (e) {
                console.error("[LoRA Stacker] Failed to restore state:", e);
            }
        };
        
        /**
         * Clear all dynamic widgets (groups and loras)
         */
        nodeType.prototype.clearDynamicWidgets = function() {
            // Keep only seed, stack_data, and action buttons
            const keepWidgets = [
                this.widgets.find(w => w.name === "seed"),
                this.stackDataWidget,
                this.addLoraButton,
                this.addGroupButton
            ].filter(w => w); // Filter out undefined
            
            // Remove all other widgets
            const toRemove = this.widgets.filter(w => !keepWidgets.includes(w));
            for (const widget of toRemove) {
                const idx = this.widgets.indexOf(widget);
                if (idx >= 0) {
                    this.widgets.splice(idx, 1);
                }
            }
        };
        
        /**
         * Rebuild the entire UI from state
         */
        nodeType.prototype.rebuildUI = function() {
            const state = this.loraState;
            
            // Clear dynamic widgets first
            this.clearDynamicWidgets();
            
            // Build mapping of old IDs to new IDs
            const groupIdMap = new Map();
            const loraIdMap = new Map();
            
            let nextGlobalGroupId = 1;
            let nextGlobalLoraId = 1;
            
            // Rebuild groups and their loras
            for (const groupData of state.groups || []) {
                const oldGroupId = groupData.id;
                const newGroupId = nextGlobalGroupId++;
                groupIdMap.set(oldGroupId, newGroupId);
                
                this.createGroupWidgets(newGroupId, groupData);
                
                // Add loras for this group
                const groupLoras = (state.loras || []).filter(l => l.group_id === oldGroupId);
                for (const loraData of groupLoras) {
                    const oldLoraId = loraData.id;
                    const newLoraId = nextGlobalLoraId++;
                    loraIdMap.set(oldLoraId, newLoraId);
                    
                    this.createLoraWidgets(newLoraId, newGroupId, loraData);
                }
            }
            
            // Rebuild ungrouped loras
            const ungroupedLoras = (state.loras || []).filter(l => !l.group_id);
            for (const loraData of ungroupedLoras) {
                const oldLoraId = loraData.id;
                const newLoraId = nextGlobalLoraId++;
                loraIdMap.set(oldLoraId, newLoraId);
                
                this.createLoraWidgets(newLoraId, null, loraData);
            }
            
            // Update IDs in state to match new IDs
            for (const group of state.groups || []) {
                const newId = groupIdMap.get(group.id);
                if (newId) group.id = newId;
            }
            for (const lora of state.loras || []) {
                const newLoraId = loraIdMap.get(lora.id);
                const newGroupId = lora.group_id ? groupIdMap.get(lora.group_id) : null;
                if (newLoraId) lora.id = newLoraId;
                if (newGroupId !== undefined) lora.group_id = newGroupId;
            }
            
            // Update counters
            this.nextGroupId = nextGlobalGroupId;
            this.nextLoraId = nextGlobalLoraId;
            
            this.setSize(this.computeSize());
        };
        
        /**
         * Add a new group
         */
        nodeType.prototype.addGroup = function() {
            const groupId = this.nextGroupId++;
            const groupIndex = this.loraState.groups.length + 1;
            
            const groupData = {
                id: groupId,
                index: groupIndex,
                max_model: 1.0,
                max_clip: 1.0
            };
            
            this.loraState.groups.push(groupData);
            this.createGroupWidgets(groupId, groupData);
            this.saveState();
            this.setSize(this.computeSize());
        };
        
        /**
         * Create widgets for a group (appends to end before action buttons)
         */
        nodeType.prototype.createGroupWidgets = function(groupId, groupData) {
            // Header button (collapse/expand)
            const collapsed = this.collapsedGroups.has(groupId);
            const headerWidget = this.addWidget("button", 
                `${collapsed ? '▶' : '▼'} Group ${groupData.index}`, 
                null, 
                () => this.toggleGroupCollapse(groupId)
            );
            headerWidget._groupId = groupId;
            headerWidget._isGroupWidget = true;
            this.moveWidgetBeforeActionButtons(headerWidget);
            
            // Remove button
            const removeBtn = this.addWidget("button", "✕ Remove", null, 
                () => this.removeGroup(groupId)
            );
            removeBtn._groupId = groupId;
            removeBtn._isGroupWidget = true;
            this.moveWidgetBeforeActionButtons(removeBtn);
            
            // Max MODEL strength
            const maxModelWidget = ComfyWidgets.FLOAT(this, "max_model_temp", ["FLOAT", { 
                default: groupData.max_model, 
                min: 0.0, 
                max: 10.0, 
                step: 0.01 
            }], app).widget;
            maxModelWidget.name = "  Max MODEL";
            maxModelWidget.value = groupData.max_model;
            const origCallback = maxModelWidget.callback;
            maxModelWidget.callback = (v) => {
                if (origCallback) origCallback.call(maxModelWidget, v);
                const group = this.loraState.groups.find(g => g.id === groupId);
                if (group) {
                    group.max_model = v;
                    this.saveState();
                }
            };
            maxModelWidget._groupId = groupId;
            maxModelWidget._isGroupWidget = true;
            this.moveWidgetBeforeActionButtons(maxModelWidget);
            
            // Max CLIP strength
            const maxClipWidget = ComfyWidgets.FLOAT(this, "max_clip_temp", ["FLOAT", { 
                default: groupData.max_clip, 
                min: 0.0, 
                max: 10.0, 
                step: 0.01 
            }], app).widget;
            maxClipWidget.name = "  Max CLIP";
            maxClipWidget.value = groupData.max_clip;
            const origClipCallback = maxClipWidget.callback;
            maxClipWidget.callback = (v) => {
                if (origClipCallback) origClipCallback.call(maxClipWidget, v);
                const group = this.loraState.groups.find(g => g.id === groupId);
                if (group) {
                    group.max_clip = v;
                    this.saveState();
                }
            };
            maxClipWidget._groupId = groupId;
            maxClipWidget._isGroupWidget = true;
            this.moveWidgetBeforeActionButtons(maxClipWidget);
            
            // Add LoRA to group button
            const addLoraBtn = this.addWidget("button", "  ➕ Add LoRA", null,
                () => this.addLora(groupId)
            );
            addLoraBtn._groupId = groupId;
            addLoraBtn._isGroupWidget = true;
            this.moveWidgetBeforeActionButtons(addLoraBtn);
        };
        
        /**
         * Move a widget before the action buttons
         */
        nodeType.prototype.moveWidgetBeforeActionButtons = function(widget) {
            const widgetIdx = this.widgets.indexOf(widget);
            const actionButtonIdx = this.widgets.indexOf(this.addLoraButton);
            
            if (widgetIdx > actionButtonIdx) {
                this.widgets.splice(widgetIdx, 1);
                this.widgets.splice(actionButtonIdx, 0, widget);
            }
        };
        
        /**
         * Remove a group
         */
        nodeType.prototype.removeGroup = function(groupId) {
            // Find and remove from state
            const groupIdx = this.loraState.groups.findIndex(g => g.id === groupId);
            if (groupIdx < 0) return;
            
            const group = this.loraState.groups[groupIdx];
            
            // Remove all loras in this group
            this.loraState.loras = this.loraState.loras.filter(l => l.group_id !== groupId);
            
            // Remove the group
            this.loraState.groups.splice(groupIdx, 1);
            
            // Update indices
            for (let i = 0; i < this.loraState.groups.length; i++) {
                this.loraState.groups[i].index = i + 1;
            }
            
            // Rebuild UI
            this.rebuildUI();
            this.saveState();
        };
        
        /**
         * Toggle group collapse
         */
        nodeType.prototype.toggleGroupCollapse = function(groupId) {
            if (this.collapsedGroups.has(groupId)) {
                this.collapsedGroups.delete(groupId);
            } else {
                this.collapsedGroups.add(groupId);
            }
            
            // Rebuild UI to reflect collapse state
            this.rebuildUI();
        };
        
        /**
         * Add a LoRA
         */
        nodeType.prototype.addLora = function(groupId) {
            const loraId = this.nextLoraId++;
            
            const loraData = {
                id: loraId,
                group_id: groupId,
                name: "None",
                preset: "Full"
            };
            
            if (groupId === null) {
                // Ungrouped - add randomization fields
                loraData.model_strength = 1.0;
                loraData.clip_strength = 1.0;
                loraData.random_model = false;
                loraData.min_model = 0.0;
                loraData.max_model = 1.0;
                loraData.random_clip = false;
                loraData.min_clip = 0.0;
                loraData.max_clip = 1.0;
            } else {
                // Grouped - add lock fields
                loraData.lock_model = false;
                loraData.locked_model_value = 0.0;
                loraData.lock_clip = false;
                loraData.locked_clip_value = 0.0;
            }
            
            this.loraState.loras.push(loraData);
            this.createLoraWidgets(loraId, groupId, loraData);
            this.saveState();
            this.setSize(this.computeSize());
        };
        
        /**
         * Create widgets for a LoRA (appends to end before action buttons)
         */
        nodeType.prototype.createLoraWidgets = function(loraId, groupId, loraData) {
            const prefix = groupId ? "    " : "";
            
            // LoRA selector
            const loraWidget = this.addWidget("combo", 
                `${prefix}LoRA`, 
                loraData.name,
                (v) => {
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.name = v;
                        this.saveState();
                    }
                },
                { values: availableLoRAs }
            );
            loraWidget._loraId = loraId;
            loraWidget._groupId = groupId;
            this.moveWidgetBeforeActionButtons(loraWidget);
            
            // Remove button
            const removeBtn = this.addWidget("button", "✕", null,
                () => this.removeLora(loraId)
            );
            removeBtn._loraId = loraId;
            removeBtn._groupId = groupId;
            this.moveWidgetBeforeActionButtons(removeBtn);
            
            // Preset selector
            const presetWidget = this.addWidget("combo",
                `${prefix}Type`,
                loraData.preset,
                (v) => {
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.preset = v;
                        this.saveState();
                    }
                },
                { values: ["Full", "Character", "Style", "Concept", "Fix Hands"] }
            );
            presetWidget._loraId = loraId;
            presetWidget._groupId = groupId;
            this.moveWidgetBeforeActionButtons(presetWidget);
            
            if (groupId !== null) {
                // Grouped LoRA - lock controls
                this.createGroupedLoraControls(loraId, groupId, loraData);
            } else {
                // Ungrouped LoRA - full controls
                this.createUngroupedLoraControls(loraId, loraData);
            }
        };
        
        /**
         * Create controls for grouped LoRA (lock controls)
         */
        nodeType.prototype.createGroupedLoraControls = function(loraId, groupId, loraData) {
            // MODEL lock checkbox
            const lockModelResult = ComfyWidgets.BOOLEAN(this, "lock_model_temp", ["BOOLEAN", { default: loraData.lock_model }], app);
            const lockModelWidget = lockModelResult.widget;
            lockModelWidget.name = "    🔒 MODEL";
            lockModelWidget.value = loraData.lock_model;
            const origLockModelCallback = lockModelWidget.callback;
            lockModelWidget.callback = (v) => {
                if (origLockModelCallback) origLockModelCallback.call(lockModelWidget, v);
                const lora = this.loraState.loras.find(l => l.id === loraId);
                if (lora) {
                    lora.lock_model = v;
                    this.rebuildUI();
                    this.saveState();
                }
            };
            lockModelWidget._loraId = loraId;
            lockModelWidget._groupId = groupId;
            this.moveWidgetBeforeActionButtons(lockModelWidget);
            
            // Locked MODEL value (only show if locked)
            if (loraData.lock_model) {
                const lockedModelValueResult = ComfyWidgets.FLOAT(this, "locked_model_value_temp", ["FLOAT", { 
                    default: loraData.locked_model_value, 
                    min: 0.0, 
                    max: 10.0, 
                    step: 0.01 
                }], app);
                const lockedModelValueWidget = lockedModelValueResult.widget;
                lockedModelValueWidget.name = "      Value";
                lockedModelValueWidget.value = loraData.locked_model_value;
                const origLockedModelCallback = lockedModelValueWidget.callback;
                lockedModelValueWidget.callback = (v) => {
                    if (origLockedModelCallback) origLockedModelCallback.call(lockedModelValueWidget, v);
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.locked_model_value = v;
                        this.saveState();
                    }
                };
                lockedModelValueWidget._loraId = loraId;
                lockedModelValueWidget._groupId = groupId;
                this.moveWidgetBeforeActionButtons(lockedModelValueWidget);
            }
            
            // CLIP lock checkbox
            const lockClipResult = ComfyWidgets.BOOLEAN(this, "lock_clip_temp", ["BOOLEAN", { default: loraData.lock_clip }], app);
            const lockClipWidget = lockClipResult.widget;
            lockClipWidget.name = "    🔒 CLIP";
            lockClipWidget.value = loraData.lock_clip;
            const origLockClipCallback = lockClipWidget.callback;
            lockClipWidget.callback = (v) => {
                if (origLockClipCallback) origLockClipCallback.call(lockClipWidget, v);
                const lora = this.loraState.loras.find(l => l.id === loraId);
                if (lora) {
                    lora.lock_clip = v;
                    this.rebuildUI();
                    this.saveState();
                }
            };
            lockClipWidget._loraId = loraId;
            lockClipWidget._groupId = groupId;
            this.moveWidgetBeforeActionButtons(lockClipWidget);
            
            // Locked CLIP value (only show if locked)
            if (loraData.lock_clip) {
                const lockedClipValueResult = ComfyWidgets.FLOAT(this, "locked_clip_value_temp", ["FLOAT", { 
                    default: loraData.locked_clip_value, 
                    min: 0.0, 
                    max: 10.0, 
                    step: 0.01 
                }], app);
                const lockedClipValueWidget = lockedClipValueResult.widget;
                lockedClipValueWidget.name = "      Value";
                lockedClipValueWidget.value = loraData.locked_clip_value;
                const origLockedClipCallback = lockedClipValueWidget.callback;
                lockedClipValueWidget.callback = (v) => {
                    if (origLockedClipCallback) origLockedClipCallback.call(lockedClipValueWidget, v);
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.locked_clip_value = v;
                        this.saveState();
                    }
                };
                lockedClipValueWidget._loraId = loraId;
                lockedClipValueWidget._groupId = groupId;
                this.moveWidgetBeforeActionButtons(lockedClipValueWidget);
            }
        };
        
        /**
         * Create controls for ungrouped LoRA (full controls)
         */
        nodeType.prototype.createUngroupedLoraControls = function(loraId, loraData) {
            // MODEL strength
            const modelStrResult = ComfyWidgets.FLOAT(this, "model_strength_temp", ["FLOAT", { 
                default: loraData.model_strength, 
                min: 0.0, 
                max: 10.0, 
                step: 0.01 
            }], app);
            const modelStrWidget = modelStrResult.widget;
            modelStrWidget.name = "MODEL Str";
            modelStrWidget.value = loraData.model_strength;
            const origModelStrCallback = modelStrWidget.callback;
            modelStrWidget.callback = (v) => {
                if (origModelStrCallback) origModelStrCallback.call(modelStrWidget, v);
                const lora = this.loraState.loras.find(l => l.id === loraId);
                if (lora) {
                    lora.model_strength = v;
                    this.saveState();
                }
            };
            modelStrWidget._loraId = loraId;
            this.moveWidgetBeforeActionButtons(modelStrWidget);
            
            // Random MODEL toggle
            const randomModelResult = ComfyWidgets.BOOLEAN(this, "random_model_temp", ["BOOLEAN", { default: loraData.random_model }], app);
            const randomModelWidget = randomModelResult.widget;
            randomModelWidget.name = "  🎲 Random";
            randomModelWidget.value = loraData.random_model;
            const origRandomModelCallback = randomModelWidget.callback;
            randomModelWidget.callback = (v) => {
                if (origRandomModelCallback) origRandomModelCallback.call(randomModelWidget, v);
                const lora = this.loraState.loras.find(l => l.id === loraId);
                if (lora) {
                    lora.random_model = v;
                    this.rebuildUI();
                    this.saveState();
                }
            };
            randomModelWidget._loraId = loraId;
            this.moveWidgetBeforeActionButtons(randomModelWidget);
            
            // Min/Max MODEL (only show if random)
            if (loraData.random_model) {
                const minModelResult = ComfyWidgets.FLOAT(this, "min_model_temp", ["FLOAT", { 
                    default: loraData.min_model, 
                    min: 0.0, 
                    max: 10.0, 
                    step: 0.01 
                }], app);
                const minModelWidget = minModelResult.widget;
                minModelWidget.name = "    Min";
                minModelWidget.value = loraData.min_model;
                const origMinModelCallback = minModelWidget.callback;
                minModelWidget.callback = (v) => {
                    if (origMinModelCallback) origMinModelCallback.call(minModelWidget, v);
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.min_model = v;
                        this.saveState();
                    }
                };
                minModelWidget._loraId = loraId;
                this.moveWidgetBeforeActionButtons(minModelWidget);
                
                const maxModelResult = ComfyWidgets.FLOAT(this, "max_model_temp", ["FLOAT", { 
                    default: loraData.max_model, 
                    min: 0.0, 
                    max: 10.0, 
                    step: 0.01 
                }], app);
                const maxModelWidget = maxModelResult.widget;
                maxModelWidget.name = "    Max";
                maxModelWidget.value = loraData.max_model;
                const origMaxModelCallback = maxModelWidget.callback;
                maxModelWidget.callback = (v) => {
                    if (origMaxModelCallback) origMaxModelCallback.call(maxModelWidget, v);
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.max_model = v;
                        this.saveState();
                    }
                };
                maxModelWidget._loraId = loraId;
                this.moveWidgetBeforeActionButtons(maxModelWidget);
            }
            
            // CLIP strength
            const clipStrResult = ComfyWidgets.FLOAT(this, "clip_strength_temp", ["FLOAT", { 
                default: loraData.clip_strength, 
                min: 0.0, 
                max: 10.0, 
                step: 0.01 
            }], app);
            const clipStrWidget = clipStrResult.widget;
            clipStrWidget.name = "CLIP Str";
            clipStrWidget.value = loraData.clip_strength;
            const origClipStrCallback = clipStrWidget.callback;
            clipStrWidget.callback = (v) => {
                if (origClipStrCallback) origClipStrCallback.call(clipStrWidget, v);
                const lora = this.loraState.loras.find(l => l.id === loraId);
                if (lora) {
                    lora.clip_strength = v;
                    this.saveState();
                }
            };
            clipStrWidget._loraId = loraId;
            this.moveWidgetBeforeActionButtons(clipStrWidget);
            
            // Random CLIP toggle
            const randomClipResult = ComfyWidgets.BOOLEAN(this, "random_clip_temp", ["BOOLEAN", { default: loraData.random_clip }], app);
            const randomClipWidget = randomClipResult.widget;
            randomClipWidget.name = "  🎲 Random";
            randomClipWidget.value = loraData.random_clip;
            const origRandomClipCallback = randomClipWidget.callback;
            randomClipWidget.callback = (v) => {
                if (origRandomClipCallback) origRandomClipCallback.call(randomClipWidget, v);
                const lora = this.loraState.loras.find(l => l.id === loraId);
                if (lora) {
                    lora.random_clip = v;
                    this.rebuildUI();
                    this.saveState();
                }
            };
            randomClipWidget._loraId = loraId;
            this.moveWidgetBeforeActionButtons(randomClipWidget);
            
            // Min/Max CLIP (only show if random)
            if (loraData.random_clip) {
                const minClipResult = ComfyWidgets.FLOAT(this, "min_clip_temp", ["FLOAT", { 
                    default: loraData.min_clip, 
                    min: 0.0, 
                    max: 10.0, 
                    step: 0.01 
                }], app);
                const minClipWidget = minClipResult.widget;
                minClipWidget.name = "    Min";
                minClipWidget.value = loraData.min_clip;
                const origMinClipCallback = minClipWidget.callback;
                minClipWidget.callback = (v) => {
                    if (origMinClipCallback) origMinClipCallback.call(minClipWidget, v);
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.min_clip = v;
                        this.saveState();
                    }
                };
                minClipWidget._loraId = loraId;
                this.moveWidgetBeforeActionButtons(minClipWidget);
                
                const maxClipResult = ComfyWidgets.FLOAT(this, "max_clip_temp", ["FLOAT", { 
                    default: loraData.max_clip, 
                    min: 0.0, 
                    max: 10.0, 
                    step: 0.01 
                }], app);
                const maxClipWidget = maxClipResult.widget;
                maxClipWidget.name = "    Max";
                maxClipWidget.value = loraData.max_clip;
                const origMaxClipCallback = maxClipWidget.callback;
                maxClipWidget.callback = (v) => {
                    if (origMaxClipCallback) origMaxClipCallback.call(maxClipWidget, v);
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.max_clip = v;
                        this.saveState();
                    }
                };
                maxClipWidget._loraId = loraId;
                this.moveWidgetBeforeActionButtons(maxClipWidget);
            }
        };
        
        /**
         * Remove a LoRA
         */
        nodeType.prototype.removeLora = function(loraId) {
            const loraIdx = this.loraState.loras.findIndex(l => l.id === loraId);
            if (loraIdx < 0) return;
            
            this.loraState.loras.splice(loraIdx, 1);
            this.rebuildUI();
            this.saveState();
        };
        
        /**
         * Compute node size based on widgets
         */
        nodeType.prototype.computeSize = function(out) {
            let height = 60; // Base height
            const width = 450;
            
            // Add height for each visible widget
            for (const widget of this.widgets) {
                if (widget.computeSize) {
                    const size = widget.computeSize(width);
                    if (size && size[1] > 0) {
                        height += size[1] + 4;
                    }
                } else if (widget.type !== "converted-widget") {
                    height += 30; // Standard widget height
                }
            }
            
            const size = [width, Math.max(140, height)];
            if (out) {
                out[0] = size[0];
                out[1] = size[1];
                return out;
            }
            return size;
        };
    }
});
