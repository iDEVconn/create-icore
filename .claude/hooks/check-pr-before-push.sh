#!/bin/bash
# Blocks git commit and git push if the current branch's PR is already merged/closed.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.command // ""')

if ! echo "$COMMAND" | grep -qE 'git (push|commit)'; then
  exit 0
fi

BRANCH=$(git branch --show-current 2>/dev/null)
[ -z "$BRANCH" ] && exit 0

STATUS=$(gh pr list --state all --head "$BRANCH" --json state --jq '.[0].state' 2>/dev/null)

if [ "$STATUS" = "MERGED" ] || [ "$STATUS" = "CLOSED" ]; then
  echo "BLOCKED: PR for '$BRANCH' is $STATUS. Create a new branch first." >&2
  exit 2
fi

exit 0
