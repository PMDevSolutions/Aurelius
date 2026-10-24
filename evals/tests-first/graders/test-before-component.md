---
type: tool_order
before:
  tool: Write
  input_match: '"file_path"\s*:\s*"[^"]*/Toggle\.test\.tsx"'
after:
  tool: Write
  input_match: '"file_path"\s*:\s*"[^"]*/Toggle\.tsx"'
---
The test file is written before the component.
