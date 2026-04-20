# Releasing Atlas 1

Author-only checklist for cutting a release. Triggered by pushing a `v*` tag; the `release.yml` workflow builds installers for Windows, macOS, and Linux and attaches them to a draft GitHub Release.

## Steps

1. **Make sure `main` is green.** CI badge on README should be passing.

2. **Update versions in lockstep.** These three files must all match:
   - `package.json` — `"version"` field.
   - `src-tauri/tauri.conf.json` — `"version"` field.
   - `src-tauri/Cargo.toml` — `[package] version` field.

   ```bash
   # example for 0.9.0
   npm version --no-git-tag-version 0.9.0   # updates package.json
   # then edit src-tauri/tauri.conf.json and src-tauri/Cargo.toml by hand
   ```

3. **Update `src-tauri/Cargo.lock`.**

   ```bash
   (cd src-tauri && cargo check)
   ```

4. **Commit the version bump.**

   ```bash
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
   git commit -m "chore: bump version to 0.9.0"
   ```

5. **Tag and push.**

   ```bash
   git tag v0.9.0
   git push origin main --tags
   ```

6. **Watch the `release` workflow.** It creates a draft release and attaches installers from all three matrix jobs. Takes ~15–25 minutes.

7. **Edit the draft release.** Replace the default body with a short changelog. Publish when ready.

## Versioning

Semver. Pre-1.0: minor bumps can break things. Milestone bumps (M1→M8) follow the minor version: `0.1` shipped M1, `0.8` ships M8.

## If a build fails

Check the workflow log. Common causes:
- Linux system deps changed — update the `apt-get install` list in `release.yml`.
- Tauri major version change — re-check `tauri-apps/tauri-action` pinned version compatibility.
- Lockfile drift — run `pnpm install` locally and commit.

Delete the tag locally and on origin, fix, re-tag, re-push.

```bash
git tag -d v0.9.0
git push origin :refs/tags/v0.9.0
```
