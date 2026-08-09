use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Payload transmis tel quel depuis l'event socket "livechat" du frontend jusqu'à
// la fenêtre overlay — voir LivechatMessage dans la doc API.
#[derive(Deserialize, Serialize, Clone)]
struct LivechatPayload {
    url: String,
    message: Option<String>,
    transparent: Option<bool>,
    duration: Option<f64>,
    author_discord_id: String,
    author_name: String,
}

// Affiche la fenêtre overlay et lui transmet le jumpscare reçu. On passe par une
// fenêtre séparée (plutôt que réutiliser "main") car l'overlay doit pouvoir
// s'afficher par-dessus tout même si la fenêtre principale est minimisée ou fermée.
#[tauri::command]
fn show_overlay(app: tauri::AppHandle, payload: LivechatPayload) -> Result<(), String> {
    let window = app.get_webview_window("overlay").ok_or("overlay window not found")?;
    window.emit_to("overlay", "livechat", payload).map_err(|e| e.to_string())?;
    // Pas de set_focus() : la fenêtre est click-through et ne doit jamais voler le
    // focus clavier/souris à l'application au premier plan (jeu, etc.).
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("overlay").ok_or("overlay window not found")?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![greet, show_overlay, hide_overlay])
        .setup(|app| {
            let store = app.store("config.json")?;
            let has_token = store.get("token").is_some();
            let target = if has_token { "index.html" } else { "login.html" };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App(target.into()))
                .title("livechat")
                .inner_size(1000.0, 600.0)
                .visible(true)
                .decorations(false)
                .build()?;

            // Fenêtre overlay pour l'affichage plein écran des jumpscares reçus :
            // transparente, sans décorations, toujours au premier plan, cachée au
            // démarrage — montrée à la demande via la commande show_overlay.
            //
            // On évite volontairement `.fullscreen(true)` : sur macOS, le mode
            // fullscreen natif fait basculer la fenêtre dans un Space dédié (donc
            // potentiellement un autre écran que celui affiché) et casse la
            // transparence (fond qui devient noir). À la place, on dimensionne et
            // positionne manuellement la fenêtre pour qu'elle recouvre exactement
            // l'écran principal, ce qui reste une fenêtre "normale" superposée.
            let overlay_window = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
                .title("livechat-overlay")
                .visible(false)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .build()?;

            if let Some(monitor) = overlay_window.primary_monitor()? {
                overlay_window.set_size(*monitor.size())?;
                overlay_window.set_position(*monitor.position())?;
            }

            // Ni le fond transparent ni le jumpscare lui-même ne doivent intercepter
            // les clics : la fenêtre laisse passer la souris vers ce qu'il y a
            // dessous (jeu, bureau...) en permanence.
            overlay_window.set_ignore_cursor_events(true)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
