---
name: conventional-git
description: Standardized commit messages and branch naming for AFNM mod projects. Activate when creating commits, branches, or release tags to follow the project's conventional commit format.
---

# Skill: Conventional Git

Standardized commit messages and branch naming for AFNM mods.

## When to activate

- When creating a commit
- When creating a branch
- When preparing a release tag

## Commit Message Format

```
<type>: <description>

[optional body]
```

### Types

| Type | When to use | SemVer |
|------|-------------|--------|
| `feat:` | New feature, hook, or content | minor |
| `fix:` | Bug fix | patch |
| `docs:` | Documentation only | - |
| `perf:` | Performance improvement | patch |
| `chore:` | Build, deps, tooling | - |
| `chore(release):` | Version bump + release | - |

### Examples

```
feat: add crafting difficulty modifier via onDeriveRecipeDifficulty hook
fix: guard against double mod installation on hot reload
docs: update ModAPI quick reference for 0.6.50 hooks
perf: throttle subscribe callback to 4 Hz
chore(release): v1.2.0
```

## Branch Naming

```
<type>/<short-description>
```

Examples: `feat/crafting-hook`, `fix/double-install-guard`, `docs/update-api-ref`

## Rules

- Keep commits scoped to one logical change.
- Use imperative mood: "add feature" not "added feature".
- Check `git diff` for secrets before committing.
- Tag releases as `vX.Y.Z` (e.g., `v1.0.0`).
