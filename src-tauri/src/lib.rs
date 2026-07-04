use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            let store = app.store("config.json")?;
            let has_token = store.get("token").is_some() || true;
            let target = if has_token { "index.html" } else { "login.html" };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App(target.into()))
                .title("livechat")
                .inner_size(1000.0, 600.0)
                .visible(true)
                .decorations(false)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
