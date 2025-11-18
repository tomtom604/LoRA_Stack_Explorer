"""
Advanced LoRA Stacker - A comprehensive ComfyUI custom node
Combines dynamic UI, LoRA preset functionality, and sophisticated random strength distribution.
"""

from .advanced_lora_stacker import (
    NODE_CLASS_MAPPINGS as LORA_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as LORA_DISPLAY_MAPPINGS
)
from .text_concatenator import (
    NODE_CLASS_MAPPINGS as TEXT_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as TEXT_DISPLAY_MAPPINGS
)

# Merge all node mappings
NODE_CLASS_MAPPINGS = {**LORA_MAPPINGS, **TEXT_MAPPINGS}
NODE_DISPLAY_NAME_MAPPINGS = {**LORA_DISPLAY_MAPPINGS, **TEXT_DISPLAY_MAPPINGS}

# Export web directory for JavaScript files
WEB_DIRECTORY = "js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
