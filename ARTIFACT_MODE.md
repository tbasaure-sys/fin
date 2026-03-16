# BLS Prime Artifact Mode

This is the simplest way to keep `blsprime.com` updated without depending on local folders at runtime.

## What It Does

In artifact mode, Railway does not try to rebuild the full research stack on every refresh.
It simply serves the latest prebuilt dashboard snapshot from the repo:

- `artifacts/dashboard/latest/dashboard_snapshot.json`

That snapshot already contains:

- portfolio
- stock ideas
- next best moves
- risk
- protocol
- sectors
- international
- statement intelligence

## Local Publish Flow

Run this from the `meta_alpha_allocator` repo:

```powershell
& .\scripts\refresh_blsprime_local.ps1 -PythonExe 'C:\conda\python.exe'
```

That command:

1. refreshes `portfolio_manager/output/latest`
2. refreshes `meta_alpha_allocator/output/dashboard/latest`
3. copies the deployable JSON artifacts into:
   - `artifacts/dashboard/latest`

If you want the full one-command publish flow:

```powershell
& .\scripts\publish_blsprime_artifact.ps1 -PythonExe 'C:\conda\python.exe' -Push
```

That command:

1. runs the local refresh
2. stages `artifacts/dashboard/latest`
3. commits only if the artifact changed
4. pushes to `origin`

## Deploy Flow

After publishing the artifact:

```powershell
git add artifacts/dashboard/latest scripts/refresh_blsprime_local.ps1 ARTIFACT_MODE.md
git commit -m "Update BLS Prime dashboard artifact"
git push
```

If Railway and Vercel are connected to `main`, the site will redeploy from the pushed snapshot.

## Railway Settings

Set these on Railway:

```text
META_ALLOCATOR_ARTIFACT_ONLY=1
META_ALLOCATOR_BOOT_REFRESH_DELAY=-1
META_ALLOCATOR_ARTIFACT_ROOT=/app/artifacts
```

Artifact-only mode means:

- startup reads the repo snapshot
- `/api/refresh` reloads the artifact snapshot from disk
- Railway no longer depends on your laptop directory structure just to serve the app

## Important Limitation

Artifact mode removes runtime local ties, but it does not magically recreate your research engine in the cloud.

You still need one environment to generate the snapshot artifact:

- your laptop today
- a future GitHub Action runner
- a future dedicated research worker

The difference is that production now only needs the finished artifact, not all the source folders.
