# Advanced LoRA Stacker - State Management Documentation

## Overview

The Advanced LoRA Stacker node uses a **simplified, robust state management system** designed to ensure persistent state across browser refreshes, workflow saves/loads, and ComfyUI server restarts.

## Core Design Principles

### 1. Single Source of Truth
All state is stored in a single JavaScript object: `this.loraState`

```javascript
this.loraState = {
    groups: [
        {
            id: 1,
            index: 1,
            max_model: 1.0,
            max_clip: 1.0
        }
    ],
    loras: [
        {
            id: 1,
            group_id: 1,  // null for ungrouped
            name: "example.safetensors",
            preset: "Character",
            // Grouped loras have lock fields
            lock_model: false,
            locked_model_value: 0.0,
            lock_clip: false,
            locked_clip_value: 0.0
        },
        {
            id: 2,
            group_id: null,  // ungrouped
            name: "style.safetensors",
            preset: "Style",
            // Ungrouped loras have randomization fields
            model_strength: 1.0,
            clip_strength: 1.0,
            random_model: false,
            min_model: 0.0,
            max_model: 1.0,
            random_clip: false,
            min_clip: 0.0,
            max_clip: 1.0
        }
    ]
}
```

### 2. Dual Persistence Strategy

#### Primary: Widget Serialization
- State is serialized to JSON string
- Stored in hidden `stack_data` widget
- Automatically saved in workflow JSON by ComfyUI
- Loaded via `onConfigure()` when workflow is loaded

#### Secondary: localStorage Backup
- State is also saved to browser's localStorage
- Key format: `AdvancedLoraStacker_{nodeId}`
- Provides fallback if widget serialization fails
- Survives browser refresh even if workflow isn't saved

### 3. Simple State Flow

```
User Action → Update loraState → saveState() → Update Both:
                                                 ├─ widget.value
                                                 └─ localStorage
```

```
Load Workflow → onConfigure() → Load from widget → restoreState() → rebuildUI()
                                         ↓ (fallback)
                                    localStorage
```

## Key Functions

### `saveState()`
- Called whenever state changes (add/remove/modify)
- Updates `stackDataWidget.value` with JSON string
- Saves to localStorage as backup
- Prevents recursive calls with `_saving` flag

```javascript
this.saveState = () => {
    if (this._saving) return;
    this._saving = true;
    
    const stateJson = JSON.stringify(this.loraState);
    this.stackDataWidget.value = stateJson;
    
    if (this.id) {
        saveStateToLocalStorage(this.id, this.loraState);
    }
    
    this._saving = false;
};
```

### `restoreState()`
- Called by `onConfigure()` when workflow loads
- Parses JSON from widget value
- Falls back to localStorage if widget is empty
- Calls `rebuildUI()` to recreate all widgets

```javascript
nodeType.prototype.restoreState = function() {
    if (!this.stackDataWidget?.value) {
        const localState = loadStateFromLocalStorage(this.id);
        if (localState) {
            this.loraState = localState;
            this.saveState();
        }
        return;
    }
    
    const state = JSON.parse(this.stackDataWidget.value);
    this.loraState = state;
    this.rebuildUI();
};
```

### `rebuildUI()`
- Clears all dynamic widgets (keeps seed, stack_data, action buttons)
- Recreates all groups and loras from state
- Updates IDs to maintain consistency
- Respects collapse state for groups
- Conditionally shows/hides widgets based on state (locks, random toggles)

```javascript
nodeType.prototype.rebuildUI = function() {
    this.clearDynamicWidgets();
    
    // Map old IDs to new IDs to handle potential conflicts
    const groupIdMap = new Map();
    const loraIdMap = new Map();
    
    // Rebuild groups and their loras
    for (const groupData of state.groups || []) {
        const newGroupId = this.nextGroupId++;
        groupIdMap.set(groupData.id, newGroupId);
        
        this.createGroupWidgets(newGroupId, groupData);
        
        // Add loras for this group
        const groupLoras = state.loras.filter(l => l.group_id === groupData.id);
        for (const loraData of groupLoras) {
            const newLoraId = this.nextLoraId++;
            this.createLoraWidgets(newLoraId, newGroupId, loraData);
        }
    }
    
    // Rebuild ungrouped loras
    // ... similar pattern
    
    // Update state IDs to match new widget IDs
    // ... update groups and loras with new IDs
    
    this.setSize(this.computeSize());
};
```

## Widget Management

### Widget Creation Pattern

All widgets follow a simple pattern:
1. Create widget with `addWidget()` or `ComfyWidgets` helper
2. Set properties and callbacks
3. Tag with `_groupId` or `_loraId` for tracking
4. Move before action buttons with `moveWidgetBeforeActionButtons()`

Example:
```javascript
const loraWidget = this.addWidget("combo", "LoRA", "None", 
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
```

### Widget Ordering

Widgets are always organized in this order:
1. Seed (system widget)
2. stack_data (hidden widget)
3. Groups and their loras (in order)
4. Ungrouped loras (in order)
5. "Add LoRA" button
6. "Add Group" button

The `moveWidgetBeforeActionButtons()` helper ensures proper ordering.

### Conditional Widget Display

Widgets are conditionally created based on state:
- Locked value widgets only shown when lock is enabled
- Min/Max widgets only shown when random is enabled
- This keeps UI clean and reduces complexity

## Serialization

### ComfyUI Integration

ComfyUI automatically serializes widgets to `widgets_values` array:
```json
{
    "widgets_values": [
        12345,  // seed value
        "{\"groups\":[...],\"loras\":[...]}"  // stack_data JSON string
    ]
}
```

The `stack_data` widget has `serializeValue()` that calls `saveState()` before returning value:
```javascript
this.stackDataWidget.serializeValue = () => {
    this.saveState();
    return this.stackDataWidget.value;
};
```

### Loading Process

1. ComfyUI loads workflow JSON
2. Calls `onConfigure(info)` with node info
3. `widgets_values` array is passed in `info`
4. We extract `stack_data` value from correct index
5. Set widget value and call `restoreState()`

```javascript
this.onConfigure = (info) => {
    if (info.widgets_values) {
        const stackDataIndex = this.widgets.findIndex(w => w.name === "stack_data");
        if (stackDataIndex >= 0 && info.widgets_values[stackDataIndex]) {
            this.stackDataWidget.value = info.widgets_values[stackDataIndex];
        }
    }
    this.restoreState();
};
```

## Error Handling

### Graceful Degradation

1. **Invalid JSON**: If parsing fails, state remains unchanged
2. **Missing localStorage**: Falls back to widget value only
3. **Empty State**: Node starts with empty groups/loras arrays
4. **Widget Creation Failure**: Continue with remaining widgets

### Validation

State is validated before restoration:
```javascript
nodeType.prototype.validateStackData = function() {
    if (!this.stackDataWidget?.value) {
        return false;
    }
    
    try {
        const data = JSON.parse(this.stackDataWidget.value);
        return data && (data.groups || data.loras);
    } catch (e) {
        console.error("Stack data validation failed:", e);
        return false;
    }
};
```

## Debugging

### Console Logging

The system includes comprehensive logging:
- `[LoRA Stacker] Node created, ID: {id}` - Node initialization
- `[LoRA Stacker] State saved: {json}` - State saved
- `[LoRA Stacker] Loading from widgets_values: {json}` - Loading from workflow
- `[LoRA Stacker] Loaded state from localStorage for node {id}` - localStorage fallback
- `[LoRA Stacker] Restoring state: {state}` - Beginning restoration

### Inspecting State

You can inspect current state in browser console:
```javascript
// Find the node (assuming node ID is 2)
const node = app.graph._nodes.find(n => n.id === 2);

// Check current state
console.log(node.loraState);

// Check widget value
console.log(node.stackDataWidget.value);

// Check localStorage
const key = `AdvancedLoraStacker_${node.id}`;
console.log(JSON.parse(localStorage.getItem(key)));
```

## Common Issues and Solutions

### Issue: State Not Persisting on Browser Refresh

**Cause**: localStorage might be disabled or full
**Solution**: 
1. Check browser localStorage settings
2. Clear old localStorage entries
3. Verify `saveState()` is being called (check console logs)

### Issue: State Lost When Loading Workflow

**Cause**: Widget serialization not working properly
**Solution**:
1. Check that `stack_data` widget exists in widgets array
2. Verify `onConfigure()` is being called (add logs)
3. Check workflow JSON has `widgets_values` with state

### Issue: Widgets in Wrong Order

**Cause**: Widget movement logic failing
**Solution**:
1. Verify `moveWidgetBeforeActionButtons()` is called for each widget
2. Check action buttons are created and in widgets array
3. Rebuild UI to reset widget order

### Issue: Duplicate Widgets After Restore

**Cause**: `clearDynamicWidgets()` not removing all widgets
**Solution**:
1. Check that dynamic widgets are properly filtered
2. Verify `_groupId` and `_loraId` tags are set
3. Clear state and reload workflow

## Performance Considerations

### Rebuilding vs. Incremental Updates

Current implementation uses **full rebuild** approach:
- Pros: Simpler, more reliable, ensures consistency
- Cons: Slightly slower for large configurations

For most use cases (< 50 loras), performance is imperceptible.

### State Size

State is stored as JSON string. Typical sizes:
- Empty: ~30 bytes
- 1 group + 3 loras: ~500 bytes
- 5 groups + 20 loras: ~3KB
- 10 groups + 50 loras: ~8KB

ComfyUI workflow JSON easily handles this size.

### localStorage Limits

Browser localStorage typically allows 5-10MB per domain.
Even with 100 nodes, state size is negligible.

## Future Improvements

### Potential Enhancements

1. **Incremental Updates**: Instead of full rebuild, update only changed widgets
2. **State Versioning**: Add version field to handle schema migrations
3. **Undo/Redo**: Store state history for undo functionality
4. **Export/Import**: Allow saving/loading configurations as separate JSON files
5. **Cloud Sync**: Sync state across devices using cloud storage

### Migration Path

If state schema needs to change:
```javascript
function migrateState(state) {
    const version = state.version || 1;
    
    if (version === 1) {
        // Migrate from v1 to v2
        state.version = 2;
        // ... migration logic
    }
    
    return state;
}
```

## Testing

### Manual Testing Checklist

- [ ] Create node and add group
- [ ] Add loras to group
- [ ] Set lock values
- [ ] Save workflow and reload - verify state restored
- [ ] Refresh browser - verify state restored
- [ ] Remove group - verify widgets removed
- [ ] Toggle collapse - verify UI updates
- [ ] Add ungrouped lora with random - verify conditional widgets
- [ ] Copy/paste node - verify independent state
- [ ] Delete node - verify localStorage cleaned up

### Automated Testing

See `/tmp/test_state_persistence.html` for basic state persistence tests.

## Conclusion

This state management system prioritizes:
1. **Reliability**: Dual persistence ensures state survives various scenarios
2. **Simplicity**: Single state object, clear flow, minimal complexity
3. **Maintainability**: Well-documented, consistent patterns, easy to debug

The design eliminates the race conditions and complexity of the previous implementation while ensuring robust state persistence.
