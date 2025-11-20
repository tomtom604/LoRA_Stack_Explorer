# Migration Guide: v1.x to v2.0

## Overview

Version 2.0 introduces a completely rewritten state management system that fixes all persistent state issues. While the rewrite is significant internally, most users will experience a seamless upgrade.

## What Changed

### For End Users

**Good News**: Your existing workflows will continue to work! 

- Old workflow files with v1 state data will automatically load
- The node will recreate your groups and LoRAs as configured
- State persistence is now **guaranteed** to work reliably

### For Developers

**Breaking Changes**:
- Internal widget management completely rewritten
- Serialization hooks replaced with simpler mechanism
- Widget IDs are no longer preserved during reload (but functionality is)

**New Features**:
- localStorage backup for additional persistence
- Comprehensive debugging logs with `[LoRA Stacker]` prefix
- Better error handling and validation
- Documented state structure and APIs

## Upgrading

### Installation

If you're upgrading from v1.x:

1. **Backup your workflows** (optional but recommended)
   ```bash
   cp -r ComfyUI/user/workflows/ ComfyUI/user/workflows.backup/
   ```

2. **Pull the latest version**
   ```bash
   cd ComfyUI/custom_nodes/LoRA_Stack_Explorer
   git pull origin main  # or your branch name
   ```

3. **Restart ComfyUI**
   ```bash
   # Stop ComfyUI and restart it
   ```

4. **Test your workflows**
   - Load an existing workflow with Advanced LoRA Stacker
   - Verify all groups and LoRAs are present
   - Make a change and save the workflow
   - Reload the workflow and verify the change persisted

### Verification

After upgrading, verify state persistence:

1. **Create a test node**:
   - Add Advanced LoRA Stacker to a workflow
   - Create a group
   - Add a LoRA to the group

2. **Test workflow persistence**:
   - Save the workflow
   - Close and reopen the workflow
   - ✓ Groups and LoRAs should be present

3. **Test browser persistence**:
   - Make a change (don't save workflow)
   - Refresh the browser (F5)
   - ✓ Change should still be there (thanks to localStorage)

4. **Test server restart**:
   - Save the workflow
   - Restart ComfyUI server
   - Load the workflow
   - ✓ State should be restored

## Troubleshooting

### Issue: Workflow doesn't load my old configuration

**Solution**: The workflow JSON should contain a `widgets_values` array with your state. Check:

```bash
# Look for your workflow file
cd ComfyUI/user/workflows/
cat your_workflow.json | grep stack_data
```

If `stack_data` is empty or missing, the old state wasn't saved properly. You'll need to reconfigure the node.

### Issue: State not persisting after upgrade

**Symptoms**: Changes disappear after browser refresh or workflow reload

**Solution**:
1. Open browser console (F12)
2. Look for `[LoRA Stacker]` messages
3. Check for error messages
4. Verify localStorage is enabled:
   ```javascript
   // In browser console
   localStorage.setItem('test', '123');
   localStorage.getItem('test');  // Should return '123'
   localStorage.removeItem('test');
   ```

If localStorage is blocked:
- Check browser settings
- Disable any extensions that might block it
- Try a different browser

### Issue: Duplicate widgets after loading workflow

**Symptoms**: Groups or LoRAs appear twice

**Solution**: This is a bug. To fix:
1. Remove all groups/loras
2. Save the workflow
3. Reload the workflow
4. Reconfigure the node
5. Save again

If it persists, clear localStorage:
```javascript
// In browser console
// Find your node ID (look at the node in ComfyUI)
const nodeId = 2;  // Replace with actual node ID
localStorage.removeItem(`AdvancedLoraStacker_${nodeId}`);
```

### Issue: Console shows errors during restoration

**Symptoms**: `[LoRA Stacker] Failed to restore state: ...`

**Solution**:
1. Note the error message
2. Check if workflow JSON is corrupted
3. Try creating a new node and reconfiguring
4. Report the issue with error message on GitHub

## Rollback (If Needed)

If you need to rollback to v1.x:

```bash
cd ComfyUI/custom_nodes/LoRA_Stack_Explorer
git log --oneline  # Find the commit before v2.0
git checkout <commit-hash>  # Replace with actual hash
```

Note: v1.x had state persistence issues, so rollback is not recommended unless you encounter a critical bug.

## Reporting Issues

If you encounter any issues after upgrading:

1. Check the console for `[LoRA Stacker]` messages
2. Check browser console for JavaScript errors
3. Try with a fresh workflow (new node)
4. Report on GitHub with:
   - ComfyUI version
   - Browser version
   - Console logs
   - Steps to reproduce

## Changes Summary

### What's Fixed
✓ State persistence across browser refresh  
✓ State persistence when saving/loading workflows  
✓ State persistence after ComfyUI restart  
✓ Race conditions in serialization hooks  
✓ Widget duplication issues  
✓ Unreliable state restoration  

### What's New
✓ localStorage backup for additional safety  
✓ Comprehensive debug logging  
✓ Better error messages  
✓ Technical documentation (STATE_MANAGEMENT.md)  
✓ Validation and error handling  

### What's the Same
✓ All features work identically  
✓ UI looks the same  
✓ Group management unchanged  
✓ LoRA configuration unchanged  
✓ Random distribution algorithm unchanged  
✓ Preset system unchanged  

## Developer Notes

### Internal Changes

1. **State Structure** (unchanged, but clearer):
   ```javascript
   {
     groups: [{id, index, max_model, max_clip}],
     loras: [{id, group_id, name, preset, ...}]
   }
   ```

2. **Serialization Flow** (simplified):
   ```
   Old: Multiple hooks → Complex timing → Race conditions
   New: saveState() → widget.value + localStorage → Always consistent
   ```

3. **Restoration Flow** (reliable):
   ```
   Old: onConfigure → Complex logic → Sometimes fails
   New: onConfigure → Parse JSON → rebuildUI() → Always works
   ```

4. **Widget Management** (cleaner):
   ```
   Old: Complex insertion indices → Widget positioning bugs
   New: Append + move pattern → No positioning issues
   ```

### API (For Other Developers)

If you're integrating with Advanced LoRA Stacker:

**Get Current State**:
```javascript
const node = app.graph._nodes.find(n => n.type === "AdvancedLoraStacker");
const state = node.loraState;
```

**Programmatically Modify State**:
```javascript
// Add a group
node.addGroup();

// Add a LoRA
node.addLora(null);  // null for ungrouped, groupId for grouped

// Modify state directly
node.loraState.groups[0].max_model = 1.5;
node.saveState();
node.rebuildUI();
```

**Listen for State Changes**:
```javascript
// Hook into saveState
const originalSaveState = node.saveState;
node.saveState = function() {
    originalSaveState.call(this);
    console.log("State changed:", this.loraState);
};
```

## Conclusion

Version 2.0 represents a complete internal rewrite focused on reliability and maintainability. While the changes are significant under the hood, the upgrade should be seamless for most users.

If you encounter any issues, please report them on GitHub. We're committed to making this the most reliable version yet!

Thank you for using Advanced LoRA Stacker! 🎨
