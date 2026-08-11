use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

// Filet de secours : si le clic-a-travers ou le timer JS de duree merdoient,
// Echap ferme quand meme l'overlay. Enregistre seulement pendant qu'un
// jumpscare est affiche, pour ne pas voler Echap au reste du systeme sinon.
fn escape_shortcut() -> Shortcut {
    "Escape".parse().expect("raccourci Echap invalide")
}

fn hide_overlay_internal(app: &AppHandle) {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
    let _ = app.global_shortcut().unregister(escape_shortcut());
}

// Miroir exact du payload de l'event socket "livechat" envoye par livechat-api.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct LivechatPayload {
    url: String,
    message: Option<String>,
    transparent: Option<bool>,
    duration: Option<f64>,
    author_discord_id: String,
    author_name: String,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn show_overlay(app: AppHandle, payload: LivechatPayload) -> Result<(), String> {
    app.emit_to("overlay", "livechat", payload)
        .map_err(|e| e.to_string())?;
    if let Some(overlay) = app.get_webview_window("overlay") {
        // Jamais de set_focus() ici : l'overlay ne doit pas voler le focus a l'app active.
        overlay.show().map_err(|e| e.to_string())?;
    }
    app.global_shortcut()
        .register(escape_shortcut())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_overlay(app: AppHandle) -> Result<(), String> {
    hide_overlay_internal(&app);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Doit etre le tout premier plugin enregistre (contrainte de la crate).
    // Sur Windows/Linux, un splatt://... clique dans le navigateur relance
    // l'exe : ce hook intercepte ce second lancement, en extrait l'URL et la
    // renvoie a l'instance deja ouverte via le meme event que le plugin
    // deep-link (deep-link://new-url), avant de laisser le doublon s'arreter.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        if let Some(url) = argv.iter().find(|arg| arg.starts_with("splatt://")) {
            let _ = app.emit("deep-link://new-url", vec![url.clone()]);
        }
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
            let _ = main.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if *shortcut == escape_shortcut() && event.state() == ShortcutState::Pressed {
                        hide_overlay_internal(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet, show_overlay, hide_overlay])
        .setup(|app| {
            // macOS enregistre le scheme via Info.plist au build ; Windows/Linux n'ont pas
            // d'installeur en mode dev, donc on enregistre le scheme nous-memes ici.
            #[cfg(any(windows, target_os = "linux"))]
            {
                app.deep_link().register_all()?;
            }

            let store = app.store("config.json")?;
            let has_token = store.get("token").is_some();
            let target = if has_token { "index.html" } else { "login.html" };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App(target.into()))
                .title("livechat")
                .inner_size(1000.0, 600.0)
                .visible(true)
                .decorations(false)
                .build()?;

            let overlay_window =
                WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
                    .visible(false)
                    .decorations(false)
                    .transparent(true)
                    .shadow(false)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .build()?;

            // Pas de .fullscreen(true) : sur macOS ca bascule dans un Space dedie (mauvais
            // ecran, flash noir, transparence cassee). On couvre l'ecran principal a la main.
            let monitor = overlay_window
                .primary_monitor()?
                .ok_or("no primary monitor found")?;
            overlay_window.set_size(*monitor.size())?;
            overlay_window.set_position(*monitor.position())?;
            // L'overlay (fond + jumpscare) doit toujours etre 100% click-through.
            overlay_window.set_ignore_cursor_events(true)?;

            // Sans ca, afficher la fenetre (meme sans set_focus()) peut quand
            // meme l'activer sous Windows et voler le focus clavier/souris a
            // l'app au premier plan (grave si c'est un jeu plein ecran).
            #[cfg(windows)]
            {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{
                    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
                };

                let hwnd = HWND(overlay_window.hwnd()?.0);
                unsafe {
                    let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                    SetWindowLongPtrW(
                        hwnd,
                        GWL_EXSTYLE,
                        ex_style | WS_EX_NOACTIVATE.0 as isize,
                    );
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
