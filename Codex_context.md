# Codex Context

## Where We Are

This repo is now the product shell for `BLS Prime`, not just the old Python workstation.

The main product surface is the Next.js terminal:

- `app/`
- `components/terminal-app.jsx`
- `lib/server/normalizers.js`

The Python layer is still the research/snapshot engine:

- `src/meta_alpha_allocator/dashboard/snapshot.py`
- `src/meta_alpha_allocator/dashboard/server.py`
- `src/meta_alpha_allocator/dashboard/wsgi.py`

## Current Product Direction

The product is moving toward:

- portfolio first
- explicit edge detection
- action-oriented UX
- plain-English explanations for non-finance users
- artifact-based deployment instead of local-folder dependency

Core terminal ideas already implemented:

- `Your Portfolio`
- `Next Best Moves`
- `Capital Protocol`
- `Edge Board`
- risk / scanner / portfolio charts
- shared-link alpha access

## Big Architectural Decision

Do not keep trying to make production depend on local Windows folders like:

- `Fin_model`
- `portfolio_manager`
- local `C:\...`

Instead, the deployable unit is now a prebuilt artifact:

- `artifacts/dashboard/latest/dashboard_snapshot.json`

Railway should serve that artifact in `artifact-only` mode.

## Deployment Model

### Railway

Important env vars:

```text
META_ALLOCATOR_ARTIFACT_ONLY=1
META_ALLOCATOR_ARTIFACT_ROOT=/app/artifacts
META_ALLOCATOR_BOOT_REFRESH_DELAY=-1
```

Meaning:

- Railway loads the committed snapshot artifact
- Railway no longer tries to rebuild the whole research stack on boot
- `/api/refresh` should just reload the artifact snapshot in artifact mode

### Vercel

Vercel serves the Next.js frontend.

The frontend talks to Railway for `/api/snapshot` and related data flow through the BFF layer.

## Local Workflows

### Main development environment

Use WSL, not the Windows/OneDrive copy.

Real working path:

```text
/home/t14_ultra_7_tomas/code/fin
```

If opening through Windows UI, use:

```text
\\wsl.localhost\Ubuntu\home\t14_ultra_7_tomas\code\fin
```

### Start frontend in WSL

```bash
cd ~/code/fin
source .venv/bin/activate
npm run dev
```

### Check backend snapshot in WSL

Artifact mode:

```bash
cd ~/code/fin
source .venv/bin/activate
export META_ALLOCATOR_ARTIFACT_ONLY=1
export META_ALLOCATOR_ARTIFACT_ROOT=$PWD/artifacts
PYTHONPATH=./src python -m meta_alpha_allocator.cli dashboard snapshot --json
```

## Publish Flow

There is now a one-command artifact publish helper:

- `scripts/publish_blsprime_artifact.ps1`

Use from Windows PowerShell:

```powershell
& .\scripts\publish_blsprime_artifact.ps1 -PythonExe 'C:\conda\python.exe' -Push
```

That should:

1. refresh local source outputs
2. copy JSON snapshot artifacts into `artifacts/dashboard/latest`
3. commit only if artifact files changed
4. push to GitHub

There is also the lower-level helper:

- `scripts/refresh_blsprime_local.ps1`

## What We Learned

1. `portfolio_manager --daily-screen-only` is not enough for BLS Prime.
   It writes daily-screen outputs, but does not rebuild the full artifact chain the terminal depends on.

2. The terminal needed fallback-generated chart data.
   That is now handled in `lib/server/normalizers.js`.

3. The live site used to fail because it depended on missing local data.
   Artifact mode is the fix for that.

4. WSL is now the right place to keep building.
   Do not keep developing from the OneDrive Windows copy if it can be avoided.

## Current State of the UI

The terminal is functional and more product-like than before, but still visually underpowered.

User feedback is correct:

- graphs are visible now
- graph quality is still low
- panel hierarchy can improve
- visual density and intentionality can improve a lot
- usefulness should keep increasing, especially around edge clarity and actionability

## What To Do Next

The next phase should focus on product quality, not more infra churn.

Priority order:

1. Improve visual quality of charts
   - better hierarchy
   - cleaner panel composition
   - stronger visual language
   - less placeholder feeling

2. Rework the layout into clearer panels/surfaces
   - less long-scroll dashboard feel
   - more terminal cockpit feel
   - more obvious “home / edge / portfolio / risk” grouping

3. Make the charts explain the edge better
   - sectors
   - countries
   - currencies
   - stocks
   - confirmation of fundamentals

4. Improve utility language
   - more plain-English
   - more “what changed / why it matters / what to do”

5. Keep artifact mode as the production backbone unless and until a real cloud research worker exists

## Guardrails

- Do not revert unrelated user changes.
- There are some untracked/local files in the repo history of this work; ignore them unless needed.
- Prefer editing the WSL copy going forward.
- Keep using `apply_patch` for edits.
- Keep responses concise and action-oriented.

## Immediate Next Prompt Suggestion

If continuing from terminal, assume the next task is:

“Improve the visual quality and usefulness of the BLS Prime terminal now that WSL and artifact mode are stable. Focus on panel layout, chart quality, and making edge/action/risk easier to read.”
