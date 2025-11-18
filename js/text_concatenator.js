/**
 * Text Concatenator - JavaScript Frontend
 * Handles dynamic input creation for text concatenation
 */

import { app } from "../../scripts/app.js";

const TypeSlot = {
    Input: 1,
    Output: 2,
};

const TypeSlotEvent = {
    Connect: true,
    Disconnect: false,
};

const NODE_ID = "TextConcatenator";
const INPUT_PREFIX = "text";
const INPUT_TYPE = "STRING";

app.registerExtension({
    name: "text_concatenator.TextConcatenator",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Only apply to TextConcatenator node
        if (nodeData.name !== NODE_ID) {
            return;
        }
        
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = async function() {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            
            // Add the first dynamic text input
            this.addInput(INPUT_PREFIX, INPUT_TYPE);
            
            // Set appearance for unconnected slot
            const slot = this.inputs[this.inputs.length - 1];
            if (slot) {
                slot.color_off = "#666";
            }
            
            return r;
        };
        
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(slotType, slot_idx, event, link_info, node_slot) {
            const me = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
            
            if (slotType === TypeSlot.Input) {
                if (link_info && event === TypeSlotEvent.Connect) {
                    // Get the parent (source) node from the link
                    const fromNode = this.graph._nodes.find(
                        (otherNode) => otherNode.id == link_info.origin_id
                    );
                    
                    if (fromNode) {
                        // Make sure there is a parent for the link
                        const parent_link = fromNode.outputs[link_info.origin_slot];
                        if (parent_link) {
                            node_slot.type = parent_link.type;
                            node_slot.name = `${INPUT_PREFIX}_`;
                        }
                    }
                } else if (event === TypeSlotEvent.Disconnect) {
                    this.removeInput(slot_idx);
                }
                
                // Track each slot name so we can index the unique ones
                let idx = 0;
                let slot_tracker = {};
                
                for (const slot of this.inputs) {
                    if (slot.link === null) {
                        try {
                            this.removeInput(idx);
                        } catch {
                            // Ignore errors during removal
                        }
                        continue;
                    }
                    idx += 1;
                    const name = slot.name.split('_')[0];
                    
                    // Correctly increment the count in slot_tracker
                    let count = (slot_tracker[name] || 0) + 1;
                    slot_tracker[name] = count;
                    
                    // Update the slot name with the count
                    slot.name = `${name}_${count}`;
                }
                
                // Check that the last slot is a dynamic entry
                let last = this.inputs[this.inputs.length - 1];
                if (last === undefined || (last.name != INPUT_PREFIX || last.type != INPUT_TYPE)) {
                    this.addInput(INPUT_PREFIX, INPUT_TYPE);
                    
                    // Set the unconnected slot to appear gray
                    last = this.inputs[this.inputs.length - 1];
                    if (last) {
                        last.color_off = "#666";
                    }
                }
                
                // Force the node to resize itself for the new/deleted connections
                this?.graph?.setDirtyCanvas(true);
                return me;
            }
        };
        
        return nodeType;
    }
});
