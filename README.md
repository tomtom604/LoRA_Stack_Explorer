# Advanced LoRA Stacker

A comprehensive ComfyUI custom node that combines dynamic UI capabilities, FLUX LoRA preset functionality, and sophisticated group-based random strength distribution.

## Features

### 🎯 Core Functionality

- **Dynamic UI**: Expandable interface with "Add LoRA" and "Add Group" buttons
- **LoRA Presets**: Five preset types targeting specific model blocks
- **Group Management**: Organize LoRAs into groups with shared max strengths
- **Random Strength Distribution**: Automatically partition strength values across grouped LoRAs
- **Individual Randomization**: Per-LoRA randomization controls for ungrouped LoRAs
- **Lock System**: Lock specific strength values while randomizing others
- **Collapsible Groups**: Expand/collapse groups to manage UI space

### 📋 LoRA Preset Types

1. **Full**: Apply to all blocks (standard LoRA application)
2. **Character**: Target blocks 4-11 (middle to output blocks)
3. **Style**: Target blocks 0-5 (input to middle blocks)
4. **Concept**: Target blocks 6-11 (output blocks)
5. **Fix Hands/Anatomy**: Target blocks 8-11 (late output blocks)

### 🎲 Random Partitioning Algorithm

The node uses a "stick-breaking" method for random strength distribution:

1. Generates n-1 random cut points between 0 and 1
2. Sorts cut points and calculates segments as differences
3. Rounds to 4 decimal places for precision
4. Fixes rounding errors by adjusting the largest segment
5. Respects locked values by subtracting them before partitioning
6. Uses seed-based random generation for reproducibility

## Installation

1. Navigate to your ComfyUI custom nodes directory:
   ```bash
   cd ComfyUI/custom_nodes/
   ```

2. Clone this repository:
   ```bash
   git clone https://github.com/tomtom604/advanced_LoRA_stacker.git
   ```

3. Restart ComfyUI

## Usage

### Getting Started

1. Add the "Advanced LoRA Stacker" node to your workflow
2. Connect MODEL and CLIP inputs from your checkpoint loader
3. The node starts with a minimal interface showing:
   - MODEL and CLIP input connectors
   - Seed parameter (auto-randomizes each run)
   - ➕ Add LoRA button
   - ➕ Add Group button

### Working with Groups

#### Creating a Group

1. Click "➕ Add Group" button
2. A collapsible group container appears with:
   - Group header with collapse/expand button (▼/▶)
   - Remove button (✕)
   - Max MODEL Strength parameter
   - Max CLIP Strength parameter
   - "➕ Add LoRA to Group N" button

#### Adding LoRAs to a Group

1. Click "➕ Add LoRA to Group N" within the group
2. Configure each grouped LoRA:
   - Select LoRA file from dropdown
   - Choose Type/Preset
   - Lock MODEL checkbox (shows current runtime strength)
   - Lock CLIP checkbox (shows current runtime strength)
   - When locked, enter the specific locked value

#### How Group Random Distribution Works

1. Set Max MODEL Strength (e.g., 1.0) and Max CLIP Strength (e.g., 1.0)
2. Add multiple LoRAs to the group
3. On execution, the node:
   - Identifies locked values and subtracts from max strength
   - Randomly partitions remaining strength across unlocked LoRAs
   - Displays assigned values in console output

**Example**: Three LoRAs in a group with Max MODEL = 1.0
- LoRA1: unlocked → gets 0.12
- LoRA2: locked at 0.30 → stays 0.30
- LoRA3: unlocked → gets 0.58
- Total: 0.12 + 0.30 + 0.58 = 1.00

### Working with Ungrouped LoRAs

#### Adding an Ungrouped LoRA

1. Click "➕ Add LoRA" (main button at top)
2. Configure the LoRA:
   - Select LoRA file
   - Choose Type/Preset
   - Set MODEL Strength (or enable randomization)
   - Set CLIP Strength (or enable randomization)

#### Using Randomization for Solo LoRAs

1. Enable "Random MODEL" checkbox
   - Shows Min MODEL and Max MODEL inputs
   - Each run generates random value within range
2. Enable "Random CLIP" checkbox
   - Shows Min CLIP and Max CLIP inputs
   - Each run generates random value within range
3. Disable checkboxes to use fixed strength values

### Understanding the Seed Parameter

- **control_after_generate** set to "randomize"
- Automatically generates new seed after each execution
- Ensures different random distributions each run
- Can be fixed for reproducible results

## UI Layout Structure

### Visual Hierarchy

```
┌─────────────────────────────────────┐
│ MODEL input                         │
│ CLIP input                          │
│ Seed parameter                      │
├─────────────────────────────────────┤
│ ┌─ Group 1 ───────────────────────┐ │
│ │ Max MODEL: 1.0                  │ │
│ │ Max CLIP: 1.0                   │ │
│ │ ➕ Add LoRA to Group 1          │ │
│ │   LoRA 1: name, preset, locks   │ │
│ │   LoRA 2: name, preset, locks   │ │
│ └─────────────────────────────────┘ │
│ ┌─ Group 2 ───────────────────────┐ │
│ │ Max MODEL: 0.8                  │ │
│ │ Max CLIP: 0.8                   │ │
│ │ ➕ Add LoRA to Group 2          │ │
│ │   LoRA 3: name, preset, locks   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ ➕ Add LoRA                         │
│ ➕ Add Group                        │
├─────────────────────────────────────┤
│ Ungrouped LoRA 1                    │
│   - MODEL controls with random      │
│   - CLIP controls with random       │
│ Ungrouped LoRA 2                    │
│   - MODEL controls with random      │
│   - CLIP controls with random       │
└─────────────────────────────────────┘
```

### Design Principles

- **Groups always at top**: All groups displayed before main buttons
- **Ungrouped at bottom**: Solo LoRAs appear after main buttons
- **No intermixing**: Strict separation between grouped and ungrouped
- **Collapsible containers**: Groups can be collapsed to save space
- **Rounded corners**: 6px radius matching ComfyUI native styling
- **Color coding**: Groups (#1a2a3a), Solo LoRAs (#1a1a1a)

## Console Output

The node provides detailed execution logs:

```
================================================================================
Advanced LoRA Stacker - Execution
================================================================================
Seed: 12345

────────────────────────────────────────────────────────────────────────────────
Group 1
  Max MODEL strength: 1.0000
  Max CLIP strength: 1.0000
────────────────────────────────────────────────────────────────────────────────
  ✓ character_lora.safetensors
    Type: Character
    MODEL: 0.3521  CLIP: 0.4123
  ✓ style_lora.safetensors
    Type: Style
    MODEL: 0.6479  CLIP: 0.5877 [MODEL locked]

────────────────────────────────────────────────────────────────────────────────
Ungrouped LoRAs
────────────────────────────────────────────────────────────────────────────────
  ✓ hands_fix.safetensors
    Type: Fix Hands
    MODEL: 0.7234  CLIP: 0.8912 [MODEL random, CLIP random]
================================================================================
```

## Technical Details

### Python Backend (`advanced_lora_stacker.py`)

**Key Methods**:
- `partition_strengths()`: Implements stick-breaking random partitioning
- `apply_lora_with_preset()`: Applies LoRA with block targeting
- `apply_loras()`: Main execution function

**Inputs**:
- `model`: MODEL type
- `clip`: CLIP type
- `seed`: INT with auto-randomize
- `stack_data`: STRING (hidden, stores JSON configuration)

**Outputs**:
- `model`: Processed MODEL
- `clip`: Processed CLIP
- `info`: STRING summary of applied LoRAs

### JavaScript Frontend (`js/advanced_lora_stacker.js`)

**Key Functions**:
- `addGroup()`: Creates group container
- `removeGroup()`: Removes group and members
- `toggleGroupCollapse()`: Show/hide group contents
- `addLora(groupId)`: Adds LoRA to group or ungrouped
- `removeLora(loraId)`: Removes individual LoRA
- `updateStackData()`: Serializes state to JSON
- `fetchLoraList()`: Fetches available LoRAs via API

**Data Structure**:
```json
{
  "groups": [
    {
      "id": 1,
      "index": 1,
      "max_model": 1.0,
      "max_clip": 1.0
    }
  ],
  "loras": [
    {
      "id": 1,
      "group_id": 1,
      "name": "lora_name.safetensors",
      "preset": "Character",
      "lock_model": false,
      "locked_model_value": 0.0,
      "lock_clip": true,
      "locked_clip_value": 0.5
    }
  ]
}
```

## Workflow Examples

### Example 1: Character with Multiple Styles

1. Create Group 1 for character LoRAs (Max: 1.0/1.0)
   - Add main_character.safetensors (Character preset)
   - Add character_details.safetensors (Character preset)
2. Create Group 2 for style LoRAs (Max: 0.8/0.8)
   - Add anime_style.safetensors (Style preset)
   - Add lighting_style.safetensors (Style preset)
3. Add ungrouped hands_fix.safetensors (Fix Hands preset)
   - Random MODEL: 0.5-0.8
   - Random CLIP: 0.5-0.8

### Example 2: Exploring Style Combinations

1. Create Group 1 with 5 style LoRAs (Max: 1.0/1.0)
2. Run multiple times with different seeds
3. Console output shows which combination was used
4. Lock successful combinations for future use

### Example 3: Fine-tuning Character Strength

1. Add character LoRA ungrouped
2. Enable Random MODEL: 0.6-0.9
3. Enable Random CLIP: 0.7-1.0
4. Run multiple times to find sweet spot
5. Once found, disable random and set fixed value

## Troubleshooting

### LoRAs Not Appearing in Dropdown

- Ensure LoRAs are in `ComfyUI/models/loras/` directory
- Restart ComfyUI to refresh LoRA list
- Check browser console for API errors

### Node Not Applying LoRAs

- Check console output for error messages
- Verify LoRA files are not corrupted
- Ensure MODEL and CLIP inputs are connected

### Groups Not Displaying Correctly

- Try collapsing and expanding the group
- Check that all widgets are visible
- Restart ComfyUI if issues persist

### Random Distribution Not Working

- Verify seed parameter is changing between runs
- Check that unlocked LoRAs exist in group
- Review console output for assigned values

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project follows the same license as ComfyUI.

## Credits

Inspired by:
- **rgthree's Power Lora Loader**: Dynamic UI concept
- **Bob's LoRA Loader (FLUX)**: Preset functionality
- **Random Partitioning Algorithm**: Stick-breaking method

## Changelog

### v1.0.0 (Initial Release)
- Dynamic expandable UI with groups
- LoRA preset system (Full, Character, Style, Concept, Fix Hands)
- Group-based random strength distribution
- Individual LoRA randomization controls
- Lock system for precise control
- Collapsible groups
- Comprehensive console output
- Seed-based reproducibility
