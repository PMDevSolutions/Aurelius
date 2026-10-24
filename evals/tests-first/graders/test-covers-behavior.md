---
type: llm
focus:
  source: file
  path: src/components/Toggle/Toggle.test.tsx
---
PASS if the test file renders the Toggle, finds it by an accessible role or label (for example `getByRole("switch")`), and asserts that interacting with it calls onChange with the new value.
FAIL if the file is missing, only checks that the component renders, or never exercises onChange.
