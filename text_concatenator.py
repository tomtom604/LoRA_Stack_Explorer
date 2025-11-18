"""
Text Concatenator Node
A node that concatenates an infinite amount of text inputs with a configurable delimiter.
"""


class TextConcatenator:
    """
    A node that dynamically accepts text inputs and concatenates them with a delimiter.
    Also supports indexing a specific input for individual output.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "delimiter": ("STRING", {
                    "default": ", ",
                    "multiline": True  # Allow newlines and multi-line delimiters
                }),
                "index": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 999,
                    "step": 1
                }),
            },
            "optional": {
                # Dynamic inputs will be added via JavaScript
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("combined_text", "indexed_text")
    FUNCTION = "concatenate"
    CATEGORY = "text"

    def concatenate(self, delimiter, index, **kwargs):
        """
        Concatenate all text inputs with the specified delimiter.
        Also return the text at the specified index.
        
        Args:
            delimiter: String to use between concatenated texts
            index: Which input to return individually (0-based)
            **kwargs: Dynamic text inputs (text_1, text_2, etc.)
        
        Returns:
            Tuple of (combined_text, indexed_text)
        """
        # Collect all text inputs in order
        texts = []
        i = 1
        while f"text_{i}" in kwargs:
            value = kwargs[f"text_{i}"]
            if value is not None:
                texts.append(str(value))
            i += 1
        
        # Concatenate all texts with delimiter
        combined = delimiter.join(texts) if texts else ""
        
        # Get indexed text (0-based indexing)
        indexed = ""
        if 0 <= index < len(texts):
            indexed = texts[index]
        
        return (combined, indexed)


NODE_CLASS_MAPPINGS = {
    "TextConcatenator": TextConcatenator
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TextConcatenator": "Text Concatenator"
}
