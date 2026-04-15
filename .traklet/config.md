---
adapter: github
project: YOLOVibeCode/scholaracle
tokenEnv: NEXT_PUBLIC_TRAKLET_PAT
---

# Traklet Configuration

This file configures how `npx traklet sync` discovers and syncs
test cases to the backend.

## Token

Set the `NEXT_PUBLIC_TRAKLET_PAT` environment variable with your
GitHub Personal Access Token (needs `repo` scope), or use your
`gh` CLI token: `export NEXT_PUBLIC_TRAKLET_PAT=$(gh auth token)`

## Adding Test Cases

Create markdown files in `test-cases/` with YAML frontmatter:

```yaml
---
id: TC-XXX
title: "What this test verifies"
priority: medium
labels: [test-case, feature-area]
depends: [TC-001]  # optional prerequisites
suite: auth        # optional grouping
---
```

Then use the Traklet widget or CLI to push them to GitHub Issues.
