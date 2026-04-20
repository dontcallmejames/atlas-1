use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::State;

/// Global, process-lifetime vault root. Set once by the webview after the user
/// picks a folder (or after onboarding writes it to config). None until set.
#[derive(Default)]
pub struct VaultRoot(pub Mutex<Option<PathBuf>>);

/// Resolve `rel` against `root`, guaranteeing the result stays inside `root`
/// on the real filesystem (not just lexically).
///
/// Rules:
/// 1. `rel` must not be absolute, must not start with `/` or `\`, must not
///    contain a `:` (Windows drive-prefix) or any `ParentDir` component.
/// 2. The parent of the joined path is canonicalized (resolving symlinks).
///    If canonicalization fails because the parent doesn't exist yet, we
///    walk upward to the first existing ancestor and canonicalize that.
/// 3. The final canonical parent must have the canonical `root` as a prefix.
/// 4. If the joined path already exists and is itself a symlink, we reject it
///    — plugins should not be tricked into following a link out of the vault.
fn resolve_inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    // --- 1. Lexical validation (cheap, fails early) ---
    if rel.is_empty() {
        return Err("vault path must not be empty".into());
    }
    if rel.starts_with('/') || rel.starts_with('\\') {
        return Err(format!("vault path must be relative: {rel}"));
    }
    if rel.contains(':') {
        return Err(format!("vault path must not contain ':' : {rel}"));
    }
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(format!("vault path must be relative: {rel}"));
    }
    for comp in rel_path.components() {
        use std::path::Component;
        match comp {
            Component::ParentDir => return Err(format!("vault path must not contain '..': {rel}")),
            Component::Prefix(_) | Component::RootDir => {
                return Err(format!("vault path must be relative: {rel}"));
            }
            _ => {}
        }
    }

    // --- 2. Join and canonicalize ---
    let candidate = root.join(rel_path);

    // Reject if the candidate itself is a symlink.
    if let Ok(md) = std::fs::symlink_metadata(&candidate) {
        if md.file_type().is_symlink() {
            return Err(format!("vault path must not be a symlink: {rel}"));
        }
    }

    let canonical_root = std::fs::canonicalize(root)
        .map_err(|e| format!("failed to canonicalize vault root: {e}"))?;

    // Walk upward until we find an existing ancestor we can canonicalize. This
    // supports writes to paths whose parent directory doesn't exist yet.
    let mut cursor: &Path = candidate.as_path();
    let canonical_parent = loop {
        match cursor.parent() {
            Some(parent) => {
                if let Ok(c) = std::fs::canonicalize(parent) {
                    break c;
                }
                cursor = parent;
            }
            None => return Err(format!("vault path has no parent: {rel}")),
        }
    };

    // --- 3. Enforce prefix ---
    if !canonical_parent.starts_with(&canonical_root) {
        return Err(format!("vault path escapes root: {rel}"));
    }

    Ok(candidate)
}

fn require_root(state: &State<VaultRoot>) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "vault root not set".into())
}

#[tauri::command]
pub fn set_vault_root(path: String, state: State<VaultRoot>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("vault path is not a directory: {}", path));
    }
    *state.0.lock().map_err(|e| e.to_string())? = Some(p);
    Ok(())
}

#[tauri::command]
pub fn get_vault_root(state: State<VaultRoot>) -> Option<String> {
    state
        .0
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn vault_read(path: String, state: State<VaultRoot>) -> Result<String, String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    fs::read_to_string(&abs).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_write(path: String, content: String, state: State<VaultRoot>) -> Result<(), String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_append(path: String, content: String, state: State<VaultRoot>) -> Result<(), String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&abs)
        .map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_list(path: String, state: State<VaultRoot>) -> Result<Vec<String>, String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    let read = match fs::read_dir(&abs) {
        Ok(r) => r,
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let mut names = Vec::new();
    for entry in read {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

#[tauri::command]
pub fn vault_exists(path: String, state: State<VaultRoot>) -> Result<bool, String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    Ok(abs.exists())
}

#[tauri::command]
pub fn vault_remove(path: String, state: State<VaultRoot>) -> Result<(), String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    match fs::remove_file(&abs) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(not(windows))]
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn rejects_parent_traversal() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        assert!(resolve_inside(root, "../escape.txt").is_err());
        assert!(resolve_inside(root, "foo/../../escape.txt").is_err());
    }

    #[test]
    fn rejects_absolute_path() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        #[cfg(windows)]
        let abs = "C:\\windows\\system32";
        #[cfg(not(windows))]
        let abs = "/etc/passwd";
        assert!(resolve_inside(root, abs).is_err());
    }

    #[test]
    fn accepts_normal_relative_path() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        // The file need not exist yet — this simulates a write to a new path.
        let resolved = resolve_inside(root, "notes/today.md").unwrap();
        assert!(resolved.starts_with(root));
        assert!(resolved.ends_with("today.md"));
    }

    #[test]
    #[cfg(not(windows))] // Windows symlink creation needs elevation in CI
    fn rejects_symlink_escape() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let outside = dir.path().parent().unwrap().join("outside.txt");
        fs::write(&outside, b"secret").unwrap();
        let link = root.join("escape");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        assert!(resolve_inside(root, "escape").is_err());
    }

    #[test]
    fn rejects_backslash_and_drive_prefix_on_relative_input() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        // These should all fail the validation before touching the filesystem.
        assert!(resolve_inside(root, "\\windows").is_err());
        assert!(resolve_inside(root, "C:foo").is_err());
    }
}
