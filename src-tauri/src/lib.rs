mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(vault::VaultRoot::default())
        .invoke_handler(tauri::generate_handler![
            vault::set_vault_root,
            vault::get_vault_root,
            vault::vault_read,
            vault::vault_write,
            vault::vault_append,
            vault::vault_list,
            vault::vault_exists,
            vault::vault_remove,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running Atlas 1");
}
