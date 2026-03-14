---
applyTo: "**/changelog.md"
---

# Changelog Format Instructions

## Entry Format

Every changelog entry uses a **bold component prefix** followed by a description:

```
- **component**: Description of the change (1-2 sentences max)
```

- **component**: Lowercase area/adapter name (e.g., `auth`, `MSSQL`, `dashboard`, `ui`, `backup`, `storage`, `SSO`, `Redis`)
- **Description**: One sentence, max two. No file paths or function names.

## Section Headings

Entries are grouped under emoji-prefixed `###` headings within each version. Only include sections that have entries.

| Section | Use for |
|---|---|
| `### ✨ Features` | New features, new adapters, new capabilities |
| `### 🐛 Bug Fixes` | Bug fixes |
| `### 🔒 Security` | Security-related changes |
| `### 🎨 Improvements` | Performance, UX, quality improvements |
| `### 🔄 Changed` | Changed behavior (non-breaking) |
| `### 🗑️ Removed` | Removed features, deprecated code |
| `### 📝 Documentation` | Documentation changes |
| `### 🧪 Tests` | Tests added or changed |
| `### 🔧 CI/CD` | CI/CD pipeline changes |
| `### 🐳 Docker` | Docker image info (always last, see below) |

Do **not** invent new sections. Use exactly these headings.

## Version Header Format

```markdown
## vX.Y.Z - Short Title
*Released: Month Day, Year*
```

Use `*Release: In Progress*` for unreleased versions.

## Breaking Changes

Breaking changes get a blockquote with ⚠️ directly below the release date (before any sections):

```markdown
> ⚠️ **Breaking:** Description of what breaks and migration steps.
```

## Docker Section

Every version that has a published Docker image includes a `### 🐳 Docker` section as the **last section**:

```markdown
### 🐳 Docker

- **Image**: `skyfay/dbackup:vX.Y.Z`
- **Also tagged as**: `latest`, `v1` (or `beta` for pre-releases)
- **Platforms**: linux/amd64, linux/arm64
```

Tag rules:
- **Stable releases** (no suffix): `latest` + major version tag (e.g., `v1`)
- **Beta releases** (`-beta` suffix): `beta`
- **Dev releases** (`-dev` suffix): `dev`

## Rules

1. **Grouped sections** — Entries are organized under `###` section headings, not a flat list.
2. **Bold component prefix** — Every entry starts with `**component**:` to identify the affected area.
3. **One line per entry** — Each entry is a single bullet point. Max 1-2 sentences.
4. **No implementation details** — No file paths, function names, or technical internals. Those belong in git commits.
5. **Chronological order** — Newest version at the top.
6. **No separators** — Do not add `---` between versions. VitePress renders them automatically.
7. **Docker section last** — `### 🐳 Docker` is always the final section in a version block.
8. **Omit empty sections** — Only include section headings that have at least one entry.

## Example

```markdown
## v1.2.0 - Cloud Storage & Notifications
*Released: April 15, 2026*

### ✨ Features

- **Google Drive**: OAuth 2.0 integration with folder browser and resumable uploads
- **email**: Multi-recipient tag input for comma-separated email addresses

### 🔒 Security

- **OAuth**: Refresh tokens encrypted at rest with AES-256-GCM

### 🎨 Improvements

- **dashboard**: Cached storage statistics reduce page load by 60%

### 🐛 Bug Fixes

- **auth**: SSO users no longer see a blank page after login redirect

### 📝 Documentation

- **wiki**: Per-provider setup guides for all cloud storage adapters

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.2.0`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64
```
