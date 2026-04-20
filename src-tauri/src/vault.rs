use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::State;

/// Global, process-lifetime vault root. Set once by the webview after the user
/// picks a folder (or after onboarding writes it to config). None until set.
#[derive(Default)]
pub struct VaultRoot(pub Mutex<Option<PathBuf>>);

fn resolve_inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let candidate = root.join(rel);
    let canon_root = root.to_path_buf();
    // Normalize without requiring the file to exist yet.
    // Reject any `..` segments to prevent escape.
    for component in Path::new(rel).components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(format!("path escapes vault root: {}", rel));
        }
    }
    // Still guard against absolute paths.
    if Path::new(rel).is_absolute() {
        return Err(format!("path must be relative: {}", rel));
    }
    // `candidate` will start with `root` because `rel` is relative and has no `..`.
    let _ = canon_root;
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
