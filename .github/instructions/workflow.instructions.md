---
applyTo: "**/*"
---

# Workflow Rules

## Changelog — Always Update on Every Change

**Whenever you make any change** — feature, bug fix, wiki article, CI/CD, refactor, or docs update — you **must** add a corresponding entry to `wiki/changelog.md` in the same response. Do not defer it.

### Finding the active version

The active (unreleased) version is the topmost `## vX.Y.Z` block with `*Release: In Progress*`. Always add entries there.

### Mapping changes to sections

Sections must appear in **exactly this order** (skip sections that have no entries):

| Order | Change type | Section |
|---|---|---|
| 1 | New feature, new adapter, new page | `### ✨ Features` |
| 2 | Bug fix | `### 🐛 Bug Fixes` |
| 3 | Security fix | `### 🔒 Security` |
| 4 | Performance, UX, code quality | `### 🎨 Improvements` |
| 5 | Behavior change (non-breaking) | `### 🔄 Changed` |
| 6 | Deleted feature or code | `### 🗑️ Removed` |
| 7 | New or updated wiki/docs article | `### 📝 Documentation` |
| 8 | Test changes | `### 🧪 Tests` |
| 9 | GitHub Actions, Dockerfile, scripts | `### 🔧 CI/CD` |
| 10 | Docker image info (always last) | `### 🐳 Docker` |

- If the section heading already exists in the active version, append to it. If not, create it in the correct position relative to other existing sections.
- **Never reorder** existing sections — always follow the numbered order above.
