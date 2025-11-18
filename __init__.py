"""
Advanced LoRA Stacker - A comprehensive ComfyUI custom node
Combines dynamic UI, LoRA preset functionality, and sophisticated random strength distribution.
"""

from .advanced_lora_stacker import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Export web directory for JavaScript files
WEB_DIRECTORY = "js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
