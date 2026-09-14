use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

// Regroupe les imports specifiques desktop (absents sur mobile) : tray icon
// et autostart n'existent pas sur Android/iOS.
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt;

// Filet de secours : si le clic-a-travers ou le timer JS de duree merdoient,
// Echap ferme quand meme l'overlay. Enregistre seulement pendant qu'un
// jumpscare est affiche, pour ne pas voler Echap au reste du systeme sinon.
fn escape_shortcut() -> Shortcut {
    "Escape".parse().expect("raccourci Echap invalide")
}

// Sous Windows, show() seul ne sort pas une fenetre minimisee de cet etat
// (elle reste invisible malgre le show()) : sans unminimize() d'abord,
// recliquer sur l'icone de la zone de notification ou relancer l'exe une
// fois l'appli minimisee ne faisait plus rien — la fenetre restait coincee,
// invisible et injoignable (donc impossible a fermer via sa barre de titre
// perso), forçant a tuer le process depuis le gestionnaire des taches.
fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn hide_overlay_internal(app: &AppHandle) {
    // Le handler du raccourci Echap (voir plus bas) appelle cette fonction
    // depuis l'intérieur même du callback de déclenchement du plugin
    // global-shortcut. Si on appelait unregister() directement ici, on
    // essaierait de reprendre un verrou interne au plugin déjà tenu pendant
    // le dispatch de l'event -> deadlock (l'appli se fige/plante). En passant
    // par run_on_main_thread, ce code s'exécute sur un tour de boucle
    // suivant, une fois ce verrou relâché.
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.hide();
        }
        let _ = app.global_shortcut().unregister(escape_shortcut());
    });
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
    author_avatar_hash: Option<String>,
    offset: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    name: String,
    width: u32,
    height: u32,
    is_primary: bool,
}

// Repositionne l'overlay sur l'ecran choisi dans les parametres (stocke par
// son nom, ex. "\\.\DISPLAY2" sous Windows), ou sur l'ecran principal si rien
// n'est choisi ou si l'ecran choisi a disparu (deconnecte depuis).
fn apply_overlay_monitor(app: &AppHandle) {
    let Some(overlay) = app.get_webview_window("overlay") else {
        return;
    };

    let chosen_name = app
        .store("config.json")
        .ok()
        .and_then(|s| s.get("overlayMonitor"))
        .and_then(|v| v.as_str().map(|s| s.to_string()));

    let monitor = chosen_name
        .as_deref()
        .and_then(|name| {
            overlay
                .available_monitors()
                .ok()?
                .into_iter()
                .find(|m| m.name().map(|n| n.as_str()) == Some(name))
        })
        .or_else(|| overlay.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let _ = overlay.set_size(*monitor.size());
        let _ = overlay.set_position(*monitor.position());
    }
}

#[tauri::command]
fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or("fenetre overlay introuvable")?;
    let primary_name = overlay
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .and_then(|m| m.name().cloned());

    let monitors = overlay.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .filter_map(|m| {
            let name = m.name()?.clone();
            Some(MonitorInfo {
                is_primary: Some(&name) == primary_name.as_ref(),
                name,
                width: m.size().width,
                height: m.size().height,
            })
        })
        .collect())
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
    // Repositionne a chaque affichage (et pas seulement au demarrage) : si
    // l'utilisateur change l'ecran choisi dans les parametres pendant que
    // l'app tourne, ca prend effet des le prochain jumpscare sans redemarrer.
    apply_overlay_monitor(&app);
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
        show_main_window(app);
    }));

    // Verifie les nouvelles versions via le manifeste publie sur GitHub Releases
    // (voir tauri.conf.json plugins.updater) ; process:: fournit relaunch()
    // pour redemarrer l'app une fois la mise a jour installee.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    // Demarrage avec Windows (desactivable dans les parametres). MacosLauncher
    // ne concerne que macOS (App/Launch Agent) ; sur Windows ca passe par une
    // entree dans le registre, geree par le plugin de maniere transparente.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ));

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
        .invoke_handler(tauri::generate_handler![
            greet,
            show_overlay,
            hide_overlay,
            list_monitors
        ])
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
            let main_window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App(target.into()))
                .title("livechat")
                .inner_size(1000.0, 600.0)
                .visible(true)
                .decorations(false)
                .build()?;

            // Clic sur la croix : par defaut on masque juste la fenetre au lieu de
            // quitter (l'appli continue de tourner en arriere-plan pour recevoir
            // des livechats), sauf si "closeToTray" a ete mis a false dans les
            // parametres. api.prevent_close() annule la fermeture par defaut de
            // Tauri ; sans lui la fenetre (et potentiellement l'appli, vu que
            // c'est la seule fenetre visible) se fermerait quand meme.
            #[cfg(desktop)]
            {
                let app_handle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let close_to_tray = app_handle
                            .store("config.json")
                            .ok()
                            .and_then(|s| s.get("closeToTray"))
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);

                        if close_to_tray {
                            api.prevent_close();
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        } else {
                            app_handle.exit(0);
                        }
                    }
                });
            }

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
            // ecran, flash noir, transparence cassee). On couvre l'ecran choisi a la main
            // (parametres > Overlay > Ecran d'affichage), ecran principal par defaut.
            apply_overlay_monitor(&app.handle().clone());
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

            // Icone dans la zone de notification : seul moyen de rouvrir la
            // fenetre principale une fois qu'elle est masquee (voir le handler
            // CloseRequested ci-dessus), et de vraiment quitter l'appli.
            //
            // Tout ce bloc est facultatif (confort) : une erreur ici (icone
            // manquante, echec du registre pour l'autostart, etc.) ne doit
            // JAMAIS empecher le reste de l'appli de demarrer. D'ou l'usage
            // d'une closure + match au lieu de `?`, qui remonterait l'erreur
            // jusqu'a `run().expect(...)` et ferait planter tout le programme.
            #[cfg(desktop)]
            {
                let tray_and_autostart: Result<(), Box<dyn std::error::Error>> = (|| {
                    let open_item = MenuItem::with_id(app, "open", "Ouvrir Splatt", true, None::<&str>)?;
                    let quit_item = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
                    let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                    let mut tray = TrayIconBuilder::new()
                        .menu(&tray_menu)
                        .tooltip("Splatt")
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "open" => show_main_window(app),
                            "quit" => app.exit(0),
                            _ => {}
                        })
                        .on_tray_icon_event(|tray, event| {
                            if let TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            } = event
                            {
                                show_main_window(tray.app_handle());
                            }
                        });
                    if let Some(icon) = app.default_window_icon() {
                        tray = tray.icon(icon.clone());
                    }
                    tray.build(app)?;

                    // Active le demarrage avec Windows par defaut, mais une seule fois
                    // (au tout premier lancement) : si l'utilisateur le desactive
                    // ensuite dans les parametres, on ne doit jamais le reactiver
                    // de force a un lancement suivant.
                    if store.get("autostartInitialized").is_none() {
                        let _ = app.autolaunch().enable();
                        store.set("autostartInitialized", true);
                        store.save()?;
                    }

                    Ok(())
                })();

                if let Err(e) = tray_and_autostart {
                    eprintln!("Icone tray / demarrage automatique non initialises : {e}");
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
