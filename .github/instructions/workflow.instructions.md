---
applyTo: "**/*"
---

# Workflow Rules

## Changelog — Always Update on Every Change

**Whenever you make any change** — feature, bug fix, wiki article, CI/CD, refactor, or docs update — you **must** add a corresponding entry to `wiki/changelog.md` in the same response. Do not defer it.

### Finding the active version

The active (unreleased) version is the topmost `## vX.Y.Z` block with `*Release: In Progress*`. Always add entries there.

### Mapping changes to sections

| Change type | Section |
|---|---|
| New feature, new adapter, new page | `### ✨ Features` |
| Bug fix | `### 🐛 Bug Fixes` |
| Security fix | `### 🔒 Security` |
| Performance, UX, code quality | `### 🎨 Improvements` |
| Behavior change (non-breaking) | `### 🔄 Changed` |
| Deleted feature or code | `### 🗑️ Removed` |
| New or updated wiki/docs article | `### 📝 Documentation` |
| Test changes | `### 🧪 Tests` |
| GitHub Actions, Dockerfile, scripts | `### 🔧 CI/CD` |

- If the section heading already exists in the active version, append to it. If not, create it in the correct order.
- Keep `### 🐳 Docker` as the last section — insert new sections above it.
- For entry format and section headings, see `changelog.instructions.md`.
