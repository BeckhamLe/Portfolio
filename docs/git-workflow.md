# Git Workflow — Portfolio Repo

Source of truth for all git operations in this repo. All agents MUST follow this before creating branches, commits, or PRs.

## Repo Structure

```
Portfolio/
  effects_library/        ← Effects library (own package.json, Vite config)
  site/               ← Portfolio site (own package.json, when built)
  docs/               ← Shared reference material
  CLAUDE.md           ← Project instructions
  .gitignore          ← Shared gitignore
```

## Branch Naming

### Effects Library (`effects_library/`)

| Prefix | Use case | Example |
|---|---|---|
| `lib/add/<name>` | New effect or transition | `lib/add/dissolve-wipe` |
| `lib/fix/<name>` | Fixing a broken effect | `lib/fix/reaction-diffusion` |
| `lib/app/<description>` | Library app changes (UI, nav, registry) | `lib/app/filter-by-category` |

### Portfolio Site (`site/`)

| Prefix | Use case | Example |
|---|---|---|
| `site/feat/<name>` | New feature | `site/feat/hero-section` |
| `site/fix/<description>` | Bug fix | `site/fix/mobile-nav-overflow` |
| `site/chore/<description>` | Refactor, deps, cleanup | `site/chore/upgrade-vite` |
| `site/style/<description>` | Purely visual changes | `site/style/dark-mode-tweaks` |

### Shared / Root

| Prefix | Use case | Example |
|---|---|---|
| `docs/<description>` | Documentation changes | `docs/update-3d-guide` |

## PR Titles

PR titles use the same prefixes as branches:

```
lib/add: Voronoi cells effect
lib/fix: Reaction-diffusion laplacian scaling
lib/app: Add status badges to homepage
site/feat: Hero section with blob background
site/fix: Mobile nav overflow on small screens
site/chore: Upgrade Three.js to r168
docs: Update 3D elements guide with fractal notes
```

## Workflow

1. **Pull main** before branching — always start from latest
   ```
   git checkout main
   git pull origin main
   ```

2. **Create branch** with naming convention
   ```
   git checkout -b lib/add/voronoi-cells
   ```

3. **Commit as you go** — small, logical commits with short messages
   ```
   add vertex shader for voronoi seed points
   fix mouse coordinate conversion to UV space
   wire up component to app registry
   ```

4. **Push and open PR** with prefix title
   ```
   git push -u origin lib/add/voronoi-cells
   gh pr create --title "lib/add: Voronoi cells effect" --body "..."
   ```

5. **Squash merge** into main — one clean commit per PR

6. **Delete the branch** after merge (both remote and local)
   ```
   git branch -d lib/add/voronoi-cells
   git fetch --prune
   ```

## Commit Messages (Within a Branch)

Keep them short and descriptive. These get squashed anyway — the PR title becomes the real history.

```
add vertex shader for voronoi seed points
fix mouse coordinate conversion to UV space
wire up info panel toggle
update registry with new effect metadata
```

## Good Practices

- **Never commit directly to main** — always branch + PR, even for small changes
- **One concern per PR** — don't mix an effect fix with a homepage redesign
- **Pull main before branching** — avoid merge conflicts
- **Delete merged branches** — keep the branch list clean. Enable "auto-delete head branches" in GitHub repo settings.
- **Squash merge as default** — keeps main history clean and readable
- **Tag milestones** — when something hits a meaningful state (e.g., `v1.0-library`, `v1.0-site`)
- **Review `git status` before committing** — always scan what's staged before it hits the repo

## Security / Privacy — CRITICAL

### Never commit:
- **Secrets or credentials** — API keys, tokens, passwords, `.env` files, SSH keys, service account JSON, `.pem` / `.key` files
- **Personal information** — real addresses, phone numbers, private emails, financial info
- **AI/Claude artifacts** — `.claude/` directory contents, memory files, session states, any CLAUDE.md files containing personal working agreements or private instructions
- **OS/editor junk** — `.DS_Store`, `.vscode/settings.json` with personal paths, `Thumbs.db`

### .gitignore must include:
```
node_modules/
dist/
.env*
.claude/
.DS_Store
.vscode/
*.pem
*.key
credentials*.json
```

### If a secret is accidentally committed:
It lives in git history even if deleted. You must rewrite history (`git filter-branch` or `BFG Repo-Cleaner`) and rotate the compromised credential immediately. Prevention is far easier than cleanup.

## GitHub Repo Settings (Enable These)

- **Auto-delete head branches** — cleans up remote branches after PR merge
- **Default to squash merge** — keeps merge strategy consistent
- **Branch protection on main** (optional for solo, good habit) — prevents accidental direct pushes

## Vercel Deployment

Both projects deploy from `main` via Vercel, scoped to their root directories:
- Effects library → Root Directory: `effects_library/`
- Portfolio site → Root Directory: `site/`

Vercel only redeploys when files in the scoped directory change.
