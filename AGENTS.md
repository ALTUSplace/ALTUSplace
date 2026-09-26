# Workflow

- Before applying any file changes, present the exact diff to the user (which files and lines will change), e.g. via `git diff`.
- Wait for the user's approval before editing any files.
- Only commit when the user explicitly asks.

# Release governance

Never merge any PR without explicit human approval in the current chat. Automation sequences must hard-stop after PR creation and wait, regardless of step numbering.