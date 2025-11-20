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
            
            // Reset ID counters
            this.nextGroupId = 1;
            this.nextLoraId = 1;
            
            // Rebuild groups
            for (const groupData of state.groups || []) {
                const groupId = this.nextGroupId++;
                this.createGroupWidgets(groupId, groupData);
                
                // Add loras for this group
                const groupLoras = (state.loras || []).filter(l => l.group_id === groupData.id);
                for (const loraData of groupLoras) {
                    const loraId = this.nextLoraId++;
                    this.createLoraWidgets(loraId, groupId, loraData);
                }
            }
            
            // Rebuild ungrouped loras
            const ungroupedLoras = (state.loras || []).filter(l => !l.group_id);
            for (const loraData of ungroupedLoras) {
                const loraId = this.nextLoraId++;
                this.createLoraWidgets(loraId, null, loraData);
            }
            
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
         * Create widgets for a group
         */
        nodeType.prototype.createGroupWidgets = function(groupId, groupData) {
            const insertIdx = this.getInsertIndexForGroup(groupId);
            
            // Header button (collapse/expand)
            const collapsed = this.collapsedGroups.has(groupId);
            const headerWidget = this.insertWidget(insertIdx, "button", 
                `${collapsed ? '▶' : '▼'} Group ${groupData.index}`, 
                null, 
                () => this.toggleGroupCollapse(groupId)
            );
            headerWidget._groupId = groupId;
            headerWidget._isGroupWidget = true;
            
            // Remove button
            const removeBtn = this.insertWidget(insertIdx + 1, "button", "✕ Remove", null, 
                () => this.removeGroup(groupId)
            );
            removeBtn._groupId = groupId;
            removeBtn._isGroupWidget = true;
            
            // Max MODEL strength
            const maxModelWidget = this.insertWidget(insertIdx + 2, "number", "  Max MODEL", 
                groupData.max_model, 
                (v) => {
                    const group = this.loraState.groups.find(g => g.id === groupId);
                    if (group) {
                        group.max_model = v;
                        this.saveState();
                    }
                },
                { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
            );
            maxModelWidget._groupId = groupId;
            maxModelWidget._isGroupWidget = true;
            
            // Max CLIP strength
            const maxClipWidget = this.insertWidget(insertIdx + 3, "number", "  Max CLIP", 
                groupData.max_clip,
                (v) => {
                    const group = this.loraState.groups.find(g => g.id === groupId);
                    if (group) {
                        group.max_clip = v;
                        this.saveState();
                    }
                },
                { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
            );
            maxClipWidget._groupId = groupId;
            maxClipWidget._isGroupWidget = true;
            
            // Add LoRA to group button
            const addLoraBtn = this.insertWidget(insertIdx + 4, "button", "  ➕ Add LoRA", null,
                () => this.addLora(groupId)
            );
            addLoraBtn._groupId = groupId;
            addLoraBtn._isGroupWidget = true;
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
         * Create widgets for a LoRA
         */
        nodeType.prototype.createLoraWidgets = function(loraId, groupId, loraData) {
            const insertIdx = this.getInsertIndexForLora(loraId, groupId);
            const prefix = groupId ? "    " : "";
            let widgetIdx = insertIdx;
            
            // LoRA selector
            const loraWidget = this.insertWidget(widgetIdx++, "combo", 
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
            
            // Remove button
            const removeBtn = this.insertWidget(widgetIdx++, "button", "✕", null,
                () => this.removeLora(loraId)
            );
            removeBtn._loraId = loraId;
            removeBtn._groupId = groupId;
            
            // Preset selector
            const presetWidget = this.insertWidget(widgetIdx++, "combo",
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
            
            if (groupId !== null) {
                // Grouped LoRA - lock controls
                this.createGroupedLoraControls(widgetIdx, loraId, groupId, loraData);
            } else {
                // Ungrouped LoRA - full controls
                this.createUngroupedLoraControls(widgetIdx, loraId, loraData);
            }
        };
        
        /**
         * Create controls for grouped LoRA (lock controls)
         */
        nodeType.prototype.createGroupedLoraControls = function(startIdx, loraId, groupId, loraData) {
            let widgetIdx = startIdx;
            
            // MODEL lock checkbox
            const lockModelWidget = this.insertWidget(widgetIdx++, "toggle",
                "    🔒 MODEL",
                loraData.lock_model,
                (v) => {
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.lock_model = v;
                        this.rebuildUI();
                        this.saveState();
                    }
                }
            );
            lockModelWidget._loraId = loraId;
            lockModelWidget._groupId = groupId;
            
            // Locked MODEL value (only show if locked)
            if (loraData.lock_model) {
                const lockedModelValueWidget = this.insertWidget(widgetIdx++, "number",
                    "      Value",
                    loraData.locked_model_value,
                    (v) => {
                        const lora = this.loraState.loras.find(l => l.id === loraId);
                        if (lora) {
                            lora.locked_model_value = v;
                            this.saveState();
                        }
                    },
                    { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
                );
                lockedModelValueWidget._loraId = loraId;
                lockedModelValueWidget._groupId = groupId;
            }
            
            // CLIP lock checkbox
            const lockClipWidget = this.insertWidget(widgetIdx++, "toggle",
                "    🔒 CLIP",
                loraData.lock_clip,
                (v) => {
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.lock_clip = v;
                        this.rebuildUI();
                        this.saveState();
                    }
                }
            );
            lockClipWidget._loraId = loraId;
            lockClipWidget._groupId = groupId;
            
            // Locked CLIP value (only show if locked)
            if (loraData.lock_clip) {
                const lockedClipValueWidget = this.insertWidget(widgetIdx++, "number",
                    "      Value",
                    loraData.locked_clip_value,
                    (v) => {
                        const lora = this.loraState.loras.find(l => l.id === loraId);
                        if (lora) {
                            lora.locked_clip_value = v;
                            this.saveState();
                        }
                    },
                    { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
                );
                lockedClipValueWidget._loraId = loraId;
                lockedClipValueWidget._groupId = groupId;
            }
        };
        
        /**
         * Create controls for ungrouped LoRA (full controls)
         */
        nodeType.prototype.createUngroupedLoraControls = function(startIdx, loraId, loraData) {
            let widgetIdx = startIdx;
            
            // MODEL strength
            const modelStrWidget = this.insertWidget(widgetIdx++, "number",
                "MODEL Str",
                loraData.model_strength,
                (v) => {
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.model_strength = v;
                        this.saveState();
                    }
                },
                { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
            );
            modelStrWidget._loraId = loraId;
            
            // Random MODEL toggle
            const randomModelWidget = this.insertWidget(widgetIdx++, "toggle",
                "  🎲 Random",
                loraData.random_model,
                (v) => {
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.random_model = v;
                        this.rebuildUI();
                        this.saveState();
                    }
                }
            );
            randomModelWidget._loraId = loraId;
            
            // Min/Max MODEL (only show if random)
            if (loraData.random_model) {
                const minModelWidget = this.insertWidget(widgetIdx++, "number",
                    "    Min",
                    loraData.min_model,
                    (v) => {
                        const lora = this.loraState.loras.find(l => l.id === loraId);
                        if (lora) {
                            lora.min_model = v;
                            this.saveState();
                        }
                    },
                    { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
                );
                minModelWidget._loraId = loraId;
                
                const maxModelWidget = this.insertWidget(widgetIdx++, "number",
                    "    Max",
                    loraData.max_model,
                    (v) => {
                        const lora = this.loraState.loras.find(l => l.id === loraId);
                        if (lora) {
                            lora.max_model = v;
                            this.saveState();
                        }
                    },
                    { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
                );
                maxModelWidget._loraId = loraId;
            }
            
            // CLIP strength
            const clipStrWidget = this.insertWidget(widgetIdx++, "number",
                "CLIP Str",
                loraData.clip_strength,
                (v) => {
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.clip_strength = v;
                        this.saveState();
                    }
                },
                { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
            );
            clipStrWidget._loraId = loraId;
            
            // Random CLIP toggle
            const randomClipWidget = this.insertWidget(widgetIdx++, "toggle",
                "  🎲 Random",
                loraData.random_clip,
                (v) => {
                    const lora = this.loraState.loras.find(l => l.id === loraId);
                    if (lora) {
                        lora.random_clip = v;
                        this.rebuildUI();
                        this.saveState();
                    }
                }
            );
            randomClipWidget._loraId = loraId;
            
            // Min/Max CLIP (only show if random)
            if (loraData.random_clip) {
                const minClipWidget = this.insertWidget(widgetIdx++, "number",
                    "    Min",
                    loraData.min_clip,
                    (v) => {
                        const lora = this.loraState.loras.find(l => l.id === loraId);
                        if (lora) {
                            lora.min_clip = v;
                            this.saveState();
                        }
                    },
                    { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
                );
                minClipWidget._loraId = loraId;
                
                const maxClipWidget = this.insertWidget(widgetIdx++, "number",
                    "    Max",
                    loraData.max_clip,
                    (v) => {
                        const lora = this.loraState.loras.find(l => l.id === loraId);
                        if (lora) {
                            lora.max_clip = v;
                            this.saveState();
                        }
                    },
                    { min: 0.0, max: 10.0, step: 0.01, precision: 2 }
                );
                maxClipWidget._loraId = loraId;
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
         * Helper: Insert a widget at a specific index
         */
        nodeType.prototype.insertWidget = function(index, type, name, value, callback, options) {
            let widget;
            
            if (type === "combo") {
                widget = this.addWidget(type, name, value, callback, options);
            } else if (type === "toggle") {
                widget = ComfyWidgets.BOOLEAN(this, name, ["BOOLEAN", { default: value || false }], app).widget;
                if (callback) {
                    widget.callback = callback;
                }
            } else if (type === "number") {
                widget = ComfyWidgets.FLOAT(this, name, ["FLOAT", { 
                    default: value || 0, 
                    min: options?.min ?? 0, 
                    max: options?.max ?? 10, 
                    step: options?.step ?? 0.01 
                }], app).widget;
                if (callback) {
                    widget.callback = callback;
                }
            } else {
                widget = this.addWidget(type, name, value, callback, options);
            }
            
            // Move to correct position
            const currentIdx = this.widgets.indexOf(widget);
            if (currentIdx !== index) {
                this.widgets.splice(currentIdx, 1);
                this.widgets.splice(index, 0, widget);
            }
            
            return widget;
        };
        
        /**
         * Get insertion index for a group
         */
        nodeType.prototype.getInsertIndexForGroup = function(groupId) {
            // Insert after seed and stack_data, before action buttons
            const seedIdx = this.widgets.findIndex(w => w.name === "seed");
            return seedIdx + 2; // After seed and stack_data
        };
        
        /**
         * Get insertion index for a LoRA
         */
        nodeType.prototype.getInsertIndexForLora = function(loraId, groupId) {
            if (groupId !== null) {
                // Insert after the group's "Add LoRA" button
                const groupWidgets = this.widgets.filter(w => w._groupId === groupId && w._isGroupWidget);
                if (groupWidgets.length > 0) {
                    const lastGroupWidget = groupWidgets[groupWidgets.length - 1];
                    const idx = this.widgets.indexOf(lastGroupWidget);
                    return idx + 1;
                }
            } else {
                // Insert before action buttons
                const addLoraIdx = this.widgets.indexOf(this.addLoraButton);
                return addLoraIdx;
            }
            
            return this.widgets.length - 2; // Before action buttons
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
