/**
 * Advanced LoRA Stacker - JavaScript Frontend
 * Comprehensive UI with groups, presets, and sophisticated controls
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
            
            if (data && data.LoraLoader && data.LoraLoader.input && data.LoraLoader.input.required) {
                const loraOptions = data.LoraLoader.input.required.lora_name;
                if (loraOptions && loraOptions[0]) {
                    availableLoRAs = ["None", ...loraOptions[0]];
                }
            }
        } catch (error) {
            console.error("Failed to fetch LoRA list:", error);
        }
    })();
    
    return loraListPromise;
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
            
            // Initialize node data
            this.groups = [];
            this.loras = [];
            this.nextGroupId = 1;
            this.nextLoraId = 1;
            this.collapsedGroups = new Set();
            this.isRestoring = false; // Flag to prevent loops during restoration
            
            // Set initial size
            this.setSize([450, 140]);
            this.originalSize = [450, 140];
            
            // Find the seed widget - it should already exist from INPUT_TYPES
            this.seedWidget = this.widgets.find(w => w.name === "seed");
            
            // Create main action buttons at the bottom
            this.addLoraButton = this.addWidget(
                "button",
                "➕ Add LoRA",
                null,
                () => {
                    this.addLora(null);
                }
            );
            
            this.addGroupButton = this.addWidget(
                "button",
                "➕ Add Group",
                null,
                () => {
                    this.addGroup();
                }
            );
            
            // Find or create stack_data widget (hidden)
            console.log("=== Widget Discovery ===");
            console.log("Total widgets:", this.widgets.length);
            console.log("All widgets:", this.widgets.map((w, idx) => ({
                index: idx,
                name: w.name,
                type: w.type,
                value: typeof w.value === 'string' ? (w.value.length > 50 ? w.value.substring(0, 50) + '...' : w.value) : w.value
            })));
            
            // Try to find the stack_data widget - it might be created by ComfyUI from INPUT_TYPES
            this.stackDataWidget = this.widgets.find(w => w.name === "stack_data");
            
            if (!this.stackDataWidget) {
                console.log("stack_data widget NOT found, creating it manually");
                // ComfyUI should create this widget from INPUT_TYPES, but if it doesn't, create it
                this.stackDataWidget = this.addWidget("text", "stack_data", "", () => {});
                this.stackDataWidget.type = "hidden";
                this.stackDataWidget.computeSize = () => [0, -4]; // Hide completely
                // Move to the beginning of widgets array to match INPUT_TYPES order (after seed)
                const idx = this.widgets.indexOf(this.stackDataWidget);
                if (idx > 1) {
                    this.widgets.splice(idx, 1);
                    this.widgets.splice(1, 0, this.stackDataWidget);
                }
                console.log("Created and positioned stack_data widget at index 1");
            } else {
                const idx = this.widgets.indexOf(this.stackDataWidget);
                console.log("Found existing stack_data widget at index:", idx);
                console.log("  Current value:", this.stackDataWidget.value ? this.stackDataWidget.value.substring(0, 100) + "..." : "(empty)");
                console.log("  Widget type:", this.stackDataWidget.type);
            }
            
            // Override serialize to save state
            const originalSerialize = this.serialize;
            this.serialize = function() {
                console.log("serialize called for AdvancedLoraStacker");
                // Ensure stack_data is up to date before serialization
                this.updateStackData();
                const data = originalSerialize ? originalSerialize.apply(this) : {};
                console.log("Serialized with stack_data:", this.stackDataWidget ? this.stackDataWidget.value.substring(0, 100) + "..." : "no widget");
                return data;
            };
            
            // Override configure to restore state when loading workflow
            const originalConfigure = this.configure;
            this.configure = function(info) {
                console.log("=== Configure Called ===");
                console.log("info.widgets_values:", info.widgets_values);
                console.log("Current widgets before configure:", this.widgets.map((w, idx) => ({index: idx, name: w.name, value: w.value})));
                
                if (originalConfigure) {
                    originalConfigure.apply(this, arguments);
                }
                
                console.log("Current widgets after configure:", this.widgets.map((w, idx) => ({index: idx, name: w.name, value: typeof w.value === 'string' ? w.value.substring(0, 50) + '...' : w.value})));
                
                // Restore state from stack_data after a brief delay to ensure widgets are ready
                // Use multiple attempts with increasing delays to handle different timing scenarios
                setTimeout(() => {
                    console.log("Attempting restoration after configure (50ms)");
                    this.restoreFromStackData();
                }, 50);
                
                // Backup attempt in case the first one fails
                setTimeout(() => {
                    console.log("Backup restoration attempt (200ms)");
                    this.restoreFromStackData();
                }, 200);
            };
            
            // Also try to restore immediately if widget already has value (for some edge cases)
            setTimeout(() => {
                if (this.stackDataWidget && this.stackDataWidget.value && this.stackDataWidget.value !== "" && 
                    this.groups.length === 0 && this.loras.length === 0) {
                    console.log("Initial restoration attempt from onNodeCreated");
                    this.restoreFromStackData();
                }
            }, 100);
            
            // Custom draw for visual styling
            const originalOnDrawForeground = this.onDrawForeground;
            this.onDrawForeground = function(ctx) {
                if (originalOnDrawForeground) {
                    originalOnDrawForeground.apply(this, arguments);
                }
                
                // Draw group containers with rounded corners
                const widgetY = 40; // Start after title bar
                let currentY = widgetY;
                
                for (const group of this.groups) {
                    const collapsed = this.collapsedGroups.has(group.id);
                    
                    // Calculate container bounds
                    let groupHeight = 10; // Padding
                    const groupWidgets = this.getGroupWidgets(group.id);
                    
                    for (const widget of groupWidgets) {
                        if (collapsed && widget.groupWidget && widget !== groupWidgets[0]) {
                            continue; // Skip collapsed widgets
                        }
                        const size = widget.computeSize ? widget.computeSize(this.size[0]) : [0, 30];
                        if (size[1] > 0) {
                            groupHeight += size[1] + 4;
                        }
                    }
                    
                    // Draw rounded container
                    ctx.fillStyle = "#1a2a3a";
                    ctx.strokeStyle = "#3a5a7a";
                    ctx.lineWidth = 2;
                    
                    const x = 15;
                    const y = currentY;
                    const width = this.size[0] - 30;
                    const height = groupHeight;
                    
                    ctx.beginPath();
                    ctx.moveTo(x + 6, y);
                    ctx.lineTo(x + width - 6, y);
                    ctx.quadraticCurveTo(x + width, y, x + width, y + 6);
                    ctx.lineTo(x + width, y + height - 6);
                    ctx.quadraticCurveTo(x + width, y + height, x + width - 6, y + height);
                    ctx.lineTo(x + 6, y + height);
                    ctx.quadraticCurveTo(x, y + height, x, y + height - 6);
                    ctx.lineTo(x, y + 6);
                    ctx.quadraticCurveTo(x, y, x + 6, y);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    
                    currentY += groupHeight + 10;
                }
            };
            
            return r;
        };
        
        /**
         * Get all widgets belonging to a group (including LoRAs)
         */
        nodeType.prototype.getGroupWidgets = function(groupId) {
            const group = this.groups.find(g => g.id === groupId);
            if (!group) return [];
            
            const widgets = [...group.widgets];
            
            // Add LoRA widgets that belong to this group
            const groupLoras = this.loras.filter(l => l.group_id === groupId);
            for (const lora of groupLoras) {
                widgets.push(...lora.widgets);
            }
            
            return widgets;
        };
        
        /**
         * Add a new group
         */
        nodeType.prototype.addGroup = function() {
            const groupId = this.nextGroupId++;
            const groupIndex = this.groups.length + 1;
            
            const group = {
                id: groupId,
                index: groupIndex,
                max_model: 1.0,
                max_clip: 1.0,
                widgets: []
            };
            
            // Find insertion index - groups go at the top, before action buttons
            const seedIdx = this.widgets.indexOf(this.seedWidget);
            let insertIdx = seedIdx + 1;
            
            // Insert after last group
            if (this.groups.length > 0) {
                const lastGroup = this.groups[this.groups.length - 1];
                const lastGroupWidgets = this.getGroupWidgets(lastGroup.id);
                if (lastGroupWidgets.length > 0) {
                    const lastWidget = lastGroupWidgets[lastGroupWidgets.length - 1];
                    const widgetIdx = this.widgets.indexOf(lastWidget);
                    if (widgetIdx !== -1) {
                        insertIdx = widgetIdx + 1;
                    }
                }
            }
            
            // Group header with collapse toggle and remove button
            const headerWidget = this.addWidget("button", `▼ group_${groupIndex}`, null, () => {
                this.toggleGroupCollapse(groupId);
            });
            headerWidget.groupWidget = true;
            headerWidget.groupId = groupId;
            group.widgets.push(headerWidget);
            
            // Remove group button (inline with header conceptually)
            const removeBtn = this.addWidget("button", "✕", null, () => {
                this.removeGroup(groupId);
            });
            removeBtn.groupWidget = true;
            removeBtn.groupId = groupId;
            group.widgets.push(removeBtn);
            
            // Max Model strength
            const maxModelWidget = ComfyWidgets.FLOAT(this, "max_model", ["FLOAT", {default: 1.0, min: 0.0, max: 10.0, step: 0.01}], app);
            maxModelWidget.widget.name = `  Max MODEL`;
            maxModelWidget.widget.value = 1.0;
            maxModelWidget.widget.groupWidget = true;
            maxModelWidget.widget.groupId = groupId;
            maxModelWidget.widget.callback = () => {
                group.max_model = maxModelWidget.widget.value;
                this.updateStackData();
            };
            group.widgets.push(maxModelWidget.widget);
            
            // Max CLIP strength
            const maxClipWidget = ComfyWidgets.FLOAT(this, "max_clip", ["FLOAT", {default: 1.0, min: 0.0, max: 10.0, step: 0.01}], app);
            maxClipWidget.widget.name = `  Max CLIP`;
            maxClipWidget.widget.value = 1.0;
            maxClipWidget.widget.groupWidget = true;
            maxClipWidget.widget.groupId = groupId;
            maxClipWidget.widget.callback = () => {
                group.max_clip = maxClipWidget.widget.value;
                this.updateStackData();
            };
            group.widgets.push(maxClipWidget.widget);
            
            // Add LoRA to group button
            const addLoraBtn = this.addWidget("button", `  ➕ Add LoRA`, null, () => {
                this.addLora(groupId);
            });
            addLoraBtn.groupWidget = true;
            addLoraBtn.groupId = groupId;
            group.widgets.push(addLoraBtn);
            
            // Move widgets to correct position
            for (const widget of group.widgets) {
                const currentIdx = this.widgets.indexOf(widget);
                if (currentIdx > insertIdx) {
                    this.widgets.splice(currentIdx, 1);
                    this.widgets.splice(insertIdx, 0, widget);
                }
                insertIdx++;
            }
            
            this.groups.push(group);
            this.updateStackData();
            this.setSize(this.computeSize());
        };
        
        /**
         * Remove a group and all its LoRAs
         */
        nodeType.prototype.removeGroup = function(groupId) {
            const groupIdx = this.groups.findIndex(g => g.id === groupId);
            if (groupIdx === -1) return;
            
            const group = this.groups[groupIdx];
            
            // Remove all LoRAs in this group
            const groupLoRAs = this.loras.filter(l => l.group_id === groupId);
            for (const lora of groupLoRAs) {
                this.removeLora(lora.id, true);
            }
            
            // Remove group widgets
            for (const widget of group.widgets) {
                const idx = this.widgets.indexOf(widget);
                if (idx !== -1) {
                    this.widgets.splice(idx, 1);
                }
            }
            
            // Remove group
            this.groups.splice(groupIdx, 1);
            
            // Update group indices and labels
            for (let i = 0; i < this.groups.length; i++) {
                this.groups[i].index = i + 1;
                const headerWidget = this.groups[i].widgets.find(w => w.name.includes('group_'));
                if (headerWidget) {
                    const collapsed = this.collapsedGroups.has(this.groups[i].id);
                    headerWidget.name = `${collapsed ? '▶' : '▼'} group_${i + 1}`;
                }
            }
            
            this.updateStackData();
            this.setSize(this.computeSize());
        };
        
        /**
         * Toggle group collapse state
         */
        nodeType.prototype.toggleGroupCollapse = function(groupId) {
            const group = this.groups.find(g => g.id === groupId);
            if (!group) return;
            
            const wasCollapsed = this.collapsedGroups.has(groupId);
            
            if (wasCollapsed) {
                this.collapsedGroups.delete(groupId);
            } else {
                this.collapsedGroups.add(groupId);
            }
            
            // Update header button
            const headerWidget = group.widgets.find(w => w.name.includes('group_'));
            if (headerWidget) {
                headerWidget.name = `${wasCollapsed ? '▼' : '▶'} group_${group.index}`;
            }
            
            // Toggle visibility of group widgets (except header and remove button)
            for (let i = 2; i < group.widgets.length; i++) {
                const widget = group.widgets[i];
                if (wasCollapsed) {
                    delete widget.computeSize;
                } else {
                    widget.computeSize = () => [0, -4];
                }
            }
            
            // Toggle visibility of group LoRAs
            const groupLoRAs = this.loras.filter(l => l.group_id === groupId);
            for (const lora of groupLoRAs) {
                for (const widget of lora.widgets) {
                    if (wasCollapsed) {
                        delete widget.computeSize;
                    } else {
                        widget.computeSize = () => [0, -4];
                    }
                }
            }
            
            // Adjust size
            this.setSize(this.computeSize());
        };
        
        /**
         * Add a LoRA (to a group or ungrouped)
         */
        nodeType.prototype.addLora = function(groupId) {
            const loraId = this.nextLoraId++;
            
            const lora = {
                id: loraId,
                group_id: groupId,
                name: "None",
                preset: "Full",
                widgets: []
            };
            
            if (groupId === null) {
                // Ungrouped LoRA - full controls
                lora.model_strength = 1.0;
                lora.clip_strength = 1.0;
                lora.random_model = false;
                lora.min_model = 0.0;
                lora.max_model = 1.0;
                lora.random_clip = false;
                lora.min_clip = 0.0;
                lora.max_clip = 1.0;
            } else {
                // Grouped LoRA - lock controls
                lora.lock_model = false;
                lora.locked_model_value = 0.0;
                lora.lock_clip = false;
                lora.locked_clip_value = 0.0;
            }
            
            // Find insertion index
            let insertIdx;
            if (groupId !== null) {
                // Insert after group's add button or last LoRA in group
                const group = this.groups.find(g => g.id === groupId);
                if (!group) return;
                
                const addLoraBtn = group.widgets.find(w => w.name.includes('Add LoRA'));
                insertIdx = this.widgets.indexOf(addLoraBtn) + 1;
                
                // Find last LoRA in this group
                const groupLoRAs = this.loras.filter(l => l.group_id === groupId);
                if (groupLoRAs.length > 0) {
                    const lastLora = groupLoRAs[groupLoRAs.length - 1];
                    const lastWidget = lastLora.widgets[lastLora.widgets.length - 1];
                    insertIdx = this.widgets.indexOf(lastWidget) + 1;
                }
            } else {
                // Insert before main buttons (at end)
                const addLoraIdx = this.widgets.indexOf(this.addLoraButton);
                insertIdx = addLoraIdx;
                
                // Find last ungrouped LoRA
                const ungroupedLoras = this.loras.filter(l => l.group_id === null);
                if (ungroupedLoras.length > 0) {
                    const lastLora = ungroupedLoras[ungroupedLoras.length - 1];
                    const lastWidget = lastLora.widgets[lastLora.widgets.length - 1];
                    insertIdx = this.widgets.indexOf(lastWidget) + 1;
                }
            }
            
            // LoRA name selector with inline remove button
            const loraWidget = this.addWidget("combo", groupId ? "    LoRA" : "LoRA", "None", (value) => {
                lora.name = value;
                this.updateStackData();
            }, { values: availableLoRAs });
            if (groupId) {
                loraWidget.groupWidget = true;
                loraWidget.groupId = groupId;
            }
            lora.widgets.push(loraWidget);
            
            // Remove button (small X button)
            const removeBtn = this.addWidget("button", "✕", null, () => {
                this.removeLora(loraId);
            });
            if (groupId) {
                removeBtn.groupWidget = true;
                removeBtn.groupId = groupId;
            }
            lora.widgets.push(removeBtn);
            
            // Preset selector
            const presetWidget = this.addWidget("combo", groupId ? "    Type" : "Type", "Full", (value) => {
                lora.preset = value;
                this.updateStackData();
            }, { values: ["Full", "Character", "Style", "Concept", "Fix Hands"] });
            if (groupId) {
                presetWidget.groupWidget = true;
                presetWidget.groupId = groupId;
            }
            lora.widgets.push(presetWidget);
            
            if (groupId !== null) {
                // ===== GROUPED LORA - LOCK CONTROLS =====
                
                // MODEL lock checkbox
                const lockModelWidget = ComfyWidgets.BOOLEAN(this, "lock_model", ["BOOLEAN", {default: false}], app);
                lockModelWidget.widget.name = "    🔒 MODEL";
                lockModelWidget.widget.value = false;
                lockModelWidget.widget.groupWidget = true;
                lockModelWidget.widget.groupId = groupId;
                lockModelWidget.widget.callback = (value) => {
                    lora.lock_model = value;
                    if (value) {
                        lockedModelValueWidget.computeSize = undefined;
                    } else {
                        lockedModelValueWidget.computeSize = () => [0, -4];
                    }
                    this.updateStackData();
                };
                lora.widgets.push(lockModelWidget.widget);
                
                // Locked Model value input
                const lockedModelValueWidget = ComfyWidgets.FLOAT(this, "locked_model_value", ["FLOAT", {default: 0.0, min: 0.0, max: 10.0, step: 0.01}], app);
                lockedModelValueWidget.widget.name = "      Value";
                lockedModelValueWidget.widget.value = 0.0;
                lockedModelValueWidget.widget.groupWidget = true;
                lockedModelValueWidget.widget.groupId = groupId;
                lockedModelValueWidget.widget.computeSize = () => [0, -4]; // Hidden by default
                lockedModelValueWidget.widget.callback = (value) => {
                    lora.locked_model_value = value;
                    this.updateStackData();
                };
                lora.widgets.push(lockedModelValueWidget.widget);
                
                // CLIP lock checkbox
                const lockClipWidget = ComfyWidgets.BOOLEAN(this, "lock_clip", ["BOOLEAN", {default: false}], app);
                lockClipWidget.widget.name = "    🔒 CLIP";
                lockClipWidget.widget.value = false;
                lockClipWidget.widget.groupWidget = true;
                lockClipWidget.widget.groupId = groupId;
                lockClipWidget.widget.callback = (value) => {
                    lora.lock_clip = value;
                    if (value) {
                        lockedClipValueWidget.computeSize = undefined;
                    } else {
                        lockedClipValueWidget.computeSize = () => [0, -4];
                    }
                    this.updateStackData();
                };
                lora.widgets.push(lockClipWidget.widget);
                
                // Locked CLIP value input
                const lockedClipValueWidget = ComfyWidgets.FLOAT(this, "locked_clip_value", ["FLOAT", {default: 0.0, min: 0.0, max: 10.0, step: 0.01}], app);
                lockedClipValueWidget.widget.name = "      Value";
                lockedClipValueWidget.widget.value = 0.0;
                lockedClipValueWidget.widget.groupWidget = true;
                lockedClipValueWidget.widget.groupId = groupId;
                lockedClipValueWidget.widget.computeSize = () => [0, -4]; // Hidden by default
                lockedClipValueWidget.widget.callback = (value) => {
                    lora.locked_clip_value = value;
                    this.updateStackData();
                };
                lora.widgets.push(lockedClipValueWidget.widget);
                
            } else {
                // ===== UNGROUPED LORA - FULL RANDOMIZATION CONTROLS =====
                
                // MODEL strength (fixed)
                const modelStrWidget = ComfyWidgets.FLOAT(this, "model_strength", ["FLOAT", {default: 1.0, min: 0.0, max: 10.0, step: 0.01}], app);
                modelStrWidget.widget.name = "MODEL Str";
                modelStrWidget.widget.value = 1.0;
                modelStrWidget.widget.callback = (value) => {
                    lora.model_strength = value;
                    this.updateStackData();
                };
                lora.widgets.push(modelStrWidget.widget);
                
                // Random MODEL checkbox
                const randomModelWidget = ComfyWidgets.BOOLEAN(this, "random_model", ["BOOLEAN", {default: false}], app);
                randomModelWidget.widget.name = "  🎲 Random";
                randomModelWidget.widget.value = false;
                randomModelWidget.widget.callback = (value) => {
                    lora.random_model = value;
                    if (value) {
                        minModelWidget.computeSize = undefined;
                        maxModelWidget.computeSize = undefined;
                    } else {
                        minModelWidget.computeSize = () => [0, -4];
                        maxModelWidget.computeSize = () => [0, -4];
                    }
                    this.updateStackData();
                };
                lora.widgets.push(randomModelWidget.widget);
                
                // Min MODEL
                const minModelWidget = ComfyWidgets.FLOAT(this, "min_model", ["FLOAT", {default: 0.0, min: 0.0, max: 10.0, step: 0.01}], app);
                minModelWidget.widget.name = "    Min";
                minModelWidget.widget.value = 0.0;
                minModelWidget.widget.computeSize = () => [0, -4]; // Hidden by default
                minModelWidget.widget.callback = (value) => {
                    lora.min_model = value;
                    this.updateStackData();
                };
                lora.widgets.push(minModelWidget.widget);
                
                // Max MODEL
                const maxModelWidget = ComfyWidgets.FLOAT(this, "max_model", ["FLOAT", {default: 1.0, min: 0.0, max: 10.0, step: 0.01}], app);
                maxModelWidget.widget.name = "    Max";
                maxModelWidget.widget.value = 1.0;
                maxModelWidget.widget.computeSize = () => [0, -4]; // Hidden by default
                maxModelWidget.widget.callback = (value) => {
                    lora.max_model = value;
                    this.updateStackData();
                };
                lora.widgets.push(maxModelWidget.widget);
                
                // CLIP strength (fixed)
                const clipStrWidget = ComfyWidgets.FLOAT(this, "clip_strength", ["FLOAT", {default: 1.0, min: 0.0, max: 10.0, step: 0.01}], app);
                clipStrWidget.widget.name = "CLIP Str";
                clipStrWidget.widget.value = 1.0;
                clipStrWidget.widget.callback = (value) => {
                    lora.clip_strength = value;
                    this.updateStackData();
                };
                lora.widgets.push(clipStrWidget.widget);
                
                // Random CLIP checkbox
                const randomClipWidget = ComfyWidgets.BOOLEAN(this, "random_clip", ["BOOLEAN", {default: false}], app);
                randomClipWidget.widget.name = "  🎲 Random";
                randomClipWidget.widget.value = false;
                randomClipWidget.widget.callback = (value) => {
                    lora.random_clip = value;
                    if (value) {
                        minClipWidget.computeSize = undefined;
                        maxClipWidget.computeSize = undefined;
                    } else {
                        minClipWidget.computeSize = () => [0, -4];
                        maxClipWidget.computeSize = () => [0, -4];
                    }
                    this.updateStackData();
                };
                lora.widgets.push(randomClipWidget.widget);
                
                // Min CLIP
                const minClipWidget = ComfyWidgets.FLOAT(this, "min_clip", ["FLOAT", {default: 0.0, min: 0.0, max: 10.0, step: 0.01}], app);
                minClipWidget.widget.name = "    Min";
                minClipWidget.widget.value = 0.0;
                minClipWidget.widget.computeSize = () => [0, -4]; // Hidden by default
                minClipWidget.widget.callback = (value) => {
                    lora.min_clip = value;
                    this.updateStackData();
                };
                lora.widgets.push(minClipWidget.widget);
                
                // Max CLIP
                const maxClipWidget = ComfyWidgets.FLOAT(this, "max_clip", ["FLOAT", {default: 1.0, min: 0.0, max: 10.0, step: 0.01}], app);
                maxClipWidget.widget.name = "    Max";
                maxClipWidget.widget.value = 1.0;
                maxClipWidget.widget.computeSize = () => [0, -4]; // Hidden by default
                maxClipWidget.widget.callback = (value) => {
                    lora.max_clip = value;
                    this.updateStackData();
                };
                lora.widgets.push(maxClipWidget.widget);
            }
            
            // Move widgets to correct position
            for (const widget of lora.widgets) {
                const currentIdx = this.widgets.indexOf(widget);
                if (currentIdx !== -1 && currentIdx !== insertIdx) {
                    this.widgets.splice(currentIdx, 1);
                    this.widgets.splice(insertIdx, 0, widget);
                    insertIdx++;
                } else {
                    insertIdx++;
                }
            }
            
            this.loras.push(lora);
            this.updateStackData();
            this.setSize(this.computeSize());
        };
        
        /**
         * Remove a LoRA
         */
        nodeType.prototype.removeLora = function(loraId, skipUpdate = false) {
            const loraIdx = this.loras.findIndex(l => l.id === loraId);
            if (loraIdx === -1) return;
            
            const lora = this.loras[loraIdx];
            
            // Remove widgets
            for (const widget of lora.widgets) {
                const idx = this.widgets.indexOf(widget);
                if (idx !== -1) {
                    this.widgets.splice(idx, 1);
                }
            }
            
            // Remove lora
            this.loras.splice(loraIdx, 1);
            
            if (!skipUpdate) {
                this.updateStackData();
                this.setSize(this.computeSize());
            }
        };
        
        /**
         * Update stack_data hidden widget with current configuration
         */
        nodeType.prototype.updateStackData = function() {
            if (!this.stackDataWidget) {
                console.log("updateStackData: no stackDataWidget");
                return;
            }
            
            // Skip update during restoration to prevent loops
            if (this.isRestoring) {
                console.log("updateStackData: skipping (isRestoring=true)");
                return;
            }
            
            console.log("updateStackData: updating with", this.groups.length, "groups and", this.loras.length, "loras");
            
            const data = {
                groups: this.groups.map(g => ({
                    id: g.id,
                    index: g.index,
                    max_model: g.max_model,
                    max_clip: g.max_clip
                })),
                loras: this.loras.map(l => {
                    const base = {
                        id: l.id,
                        group_id: l.group_id,
                        name: l.name,
                        preset: l.preset
                    };
                    
                    if (l.group_id !== null) {
                        // Grouped LoRA
                        base.lock_model = l.lock_model;
                        base.locked_model_value = l.locked_model_value;
                        base.lock_clip = l.lock_clip;
                        base.locked_clip_value = l.locked_clip_value;
                    } else {
                        // Ungrouped LoRA
                        base.model_strength = l.model_strength;
                        base.clip_strength = l.clip_strength;
                        base.random_model = l.random_model;
                        base.min_model = l.min_model;
                        base.max_model = l.max_model;
                        base.random_clip = l.random_clip;
                        base.min_clip = l.min_clip;
                        base.max_clip = l.max_clip;
                    }
                    
                    return base;
                })
            };
            
            const jsonString = JSON.stringify(data);
            this.stackDataWidget.value = jsonString;
            console.log("updateStackData: set value to", jsonString.substring(0, 100) + "...");
        };
        
        /**
         * Restore node state from stack_data hidden widget
         */
        nodeType.prototype.restoreFromStackData = function() {
            console.log("restoreFromStackData called");
            
            if (!this.stackDataWidget) {
                console.log("No stackDataWidget found");
                return;
            }
            
            if (!this.stackDataWidget.value || this.stackDataWidget.value === "") {
                console.log("stackDataWidget has no value");
                return;
            }
            
            console.log("stackDataWidget.value:", this.stackDataWidget.value.substring(0, 100) + "...");
            
            let data;
            try {
                data = JSON.parse(this.stackDataWidget.value);
            } catch (error) {
                console.error("Failed to parse stack_data:", error);
                return;
            }
            
            const groups = data.groups || [];
            const loras = data.loras || [];
            
            if (groups.length === 0 && loras.length === 0) {
                console.log("No groups or loras to restore");
                return;
            }
            
            // Check if we've already restored this exact state (to prevent duplicate restoration)
            const currentStateJson = JSON.stringify({groups, loras});
            if (this._lastRestoredState === currentStateJson) {
                console.log("State already restored, skipping");
                return;
            }
            this._lastRestoredState = currentStateJson;
            
            // If we already have groups or loras, clear them first to prevent duplicates
            if (this.groups.length > 0 || this.loras.length > 0) {
                console.log("Clearing existing state before restoration");
                // Clear existing groups and loras
                while (this.groups.length > 0) {
                    this.removeGroup(this.groups[0].id);
                }
                while (this.loras.length > 0) {
                    this.removeLora(this.loras[0].id, true);
                }
            }
            
            console.log("Restoring Advanced LoRA Stacker state:", groups.length, "groups,", loras.length, "loras");
            
            // Set restoration flag to prevent updateStackData from being called during restoration
            this.isRestoring = true;
            
            // First, restore all groups
            for (const groupData of groups) {
                this.addGroup();
                const group = this.groups[this.groups.length - 1];
                
                // Update group settings
                group.max_model = groupData.max_model;
                group.max_clip = groupData.max_clip;
                
                // Update widget values
                const maxModelWidget = group.widgets.find(w => w.name === "  Max MODEL");
                if (maxModelWidget) {
                    maxModelWidget.value = groupData.max_model;
                }
                
                const maxClipWidget = group.widgets.find(w => w.name === "  Max CLIP");
                if (maxClipWidget) {
                    maxClipWidget.value = groupData.max_clip;
                }
            }
            
            // Then, restore all LoRAs
            for (const loraData of loras) {
                // Find the group if this is a grouped LoRA
                let targetGroupId = null;
                if (loraData.group_id !== null && loraData.group_id !== undefined) {
                    // Match by group ID from data
                    const groupIndex = groups.findIndex(g => g.id === loraData.group_id);
                    if (groupIndex !== -1 && this.groups[groupIndex]) {
                        targetGroupId = this.groups[groupIndex].id;
                    }
                }
                
                this.addLora(targetGroupId);
                const lora = this.loras[this.loras.length - 1];
                
                // Update LoRA settings
                lora.name = loraData.name;
                lora.preset = loraData.preset;
                
                // Update widget values
                const nameWidget = lora.widgets.find(w => w.name === (targetGroupId ? "    LoRA" : "LoRA"));
                if (nameWidget) {
                    nameWidget.value = loraData.name;
                }
                
                const presetWidget = lora.widgets.find(w => w.name === (targetGroupId ? "    Type" : "Type"));
                if (presetWidget) {
                    presetWidget.value = loraData.preset;
                }
                
                if (targetGroupId !== null) {
                    // Grouped LoRA - restore lock settings
                    lora.lock_model = loraData.lock_model || false;
                    lora.locked_model_value = loraData.locked_model_value || 0.0;
                    lora.lock_clip = loraData.lock_clip || false;
                    lora.locked_clip_value = loraData.locked_clip_value || 0.0;
                    
                    const lockModelWidget = lora.widgets.find(w => w.name === "    🔒 MODEL");
                    const lockedModelValueWidget = lora.widgets.find(w => w.name === "      Value" && w === lora.widgets[lora.widgets.indexOf(lockModelWidget) + 1]);
                    
                    if (lockModelWidget) {
                        lockModelWidget.value = lora.lock_model;
                        if (lora.lock_model && lockedModelValueWidget) {
                            lockedModelValueWidget.computeSize = undefined;
                            lockedModelValueWidget.value = lora.locked_model_value;
                        }
                    }
                    
                    const lockClipWidget = lora.widgets.find(w => w.name === "    🔒 CLIP");
                    const lockedClipValueWidget = lora.widgets.find(w => w.name === "      Value" && w === lora.widgets[lora.widgets.indexOf(lockClipWidget) + 1]);
                    
                    if (lockClipWidget) {
                        lockClipWidget.value = lora.lock_clip;
                        if (lora.lock_clip && lockedClipValueWidget) {
                            lockedClipValueWidget.computeSize = undefined;
                            lockedClipValueWidget.value = lora.locked_clip_value;
                        }
                    }
                } else {
                    // Ungrouped LoRA - restore randomization settings
                    lora.model_strength = loraData.model_strength || 1.0;
                    lora.clip_strength = loraData.clip_strength || 1.0;
                    lora.random_model = loraData.random_model || false;
                    lora.min_model = loraData.min_model || 0.0;
                    lora.max_model = loraData.max_model || 1.0;
                    lora.random_clip = loraData.random_clip || false;
                    lora.min_clip = loraData.min_clip || 0.0;
                    lora.max_clip = loraData.max_clip || 1.0;
                    
                    // Update widget values
                    const modelStrWidget = lora.widgets.find(w => w.name === "MODEL Str");
                    if (modelStrWidget) {
                        modelStrWidget.value = lora.model_strength;
                    }
                    
                    const randomModelWidget = lora.widgets.find(w => w.name === "  🎲 Random" && lora.widgets.indexOf(w) < 8);
                    const minModelWidget = lora.widgets.find(w => w.name === "    Min" && lora.widgets.indexOf(w) < 8);
                    const maxModelWidget = lora.widgets.find(w => w.name === "    Max" && lora.widgets.indexOf(w) < 8);
                    
                    if (randomModelWidget) {
                        randomModelWidget.value = lora.random_model;
                        if (lora.random_model) {
                            if (minModelWidget) {
                                minModelWidget.computeSize = undefined;
                                minModelWidget.value = lora.min_model;
                            }
                            if (maxModelWidget) {
                                maxModelWidget.computeSize = undefined;
                                maxModelWidget.value = lora.max_model;
                            }
                        }
                    }
                    
                    const clipStrWidget = lora.widgets.find(w => w.name === "CLIP Str");
                    if (clipStrWidget) {
                        clipStrWidget.value = lora.clip_strength;
                    }
                    
                    const randomClipWidget = lora.widgets.find(w => w.name === "  🎲 Random" && lora.widgets.indexOf(w) > 8);
                    const minClipWidget = lora.widgets.find(w => w.name === "    Min" && lora.widgets.indexOf(w) > 8);
                    const maxClipWidget = lora.widgets.find(w => w.name === "    Max" && lora.widgets.indexOf(w) > 8);
                    
                    if (randomClipWidget) {
                        randomClipWidget.value = lora.random_clip;
                        if (lora.random_clip) {
                            if (minClipWidget) {
                                minClipWidget.computeSize = undefined;
                                minClipWidget.value = lora.min_clip;
                            }
                            if (maxClipWidget) {
                                maxClipWidget.computeSize = undefined;
                                maxClipWidget.value = lora.max_clip;
                            }
                        }
                    }
                }
            }
            
            // Clear restoration flag
            this.isRestoring = false;
            
            // Update the stack data to sync IDs (now that restoration is complete)
            this.updateStackData();
            
            // Adjust node size
            this.setSize(this.computeSize());
            
            console.log("Advanced LoRA Stacker state restored successfully");
        };
        
        /**
         * Override computeSize to calculate proper node size
         */
        nodeType.prototype.computeSize = function(out) {
            let height = 10; // Top padding
            let maxWidth = 450;
            
            // Calculate height based on all visible widgets
            // Check if widgets array exists and is iterable
            if (this.widgets && Array.isArray(this.widgets)) {
                for (const widget of this.widgets) {
                    if (widget.computeSize) {
                        const size = widget.computeSize(maxWidth);
                        if (size && size[1] > 0) {
                            height += size[1] + 4;
                        }
                    } else if (!widget.type || widget.type !== "hidden") {
                        // Standard widget height
                        height += 34;
                    }
                }
            }
            
            height += 10; // Bottom padding
            
            const size = [maxWidth, Math.max(140, height)];
            if (out) {
                out[0] = size[0];
                out[1] = size[1];
                return out;
            }
            return size;
        };
    }
});
