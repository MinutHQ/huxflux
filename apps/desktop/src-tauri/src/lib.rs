use std::path::Path;
use std::process::Command;
use serde::Serialize;
use serde_json::Value;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

#[tauri::command]
fn zoom_window(window: tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        #[allow(unused_imports)]
        use objc::{msg_send, runtime::Object, sel, sel_impl};
        let ns_window = window.ns_window().unwrap() as *mut Object;
        unsafe { let _: () = msg_send![ns_window, zoom: ns_window]; }
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = window; }
}

fn find_cli(name: &str) -> Option<String> {
    let candidates = [
        format!("/usr/local/bin/{}", name),
        format!("/opt/homebrew/bin/{}", name),
        format!("/usr/bin/{}", name),
    ];
    for p in &candidates {
        if Path::new(p).exists() {
            return Some(p.clone());
        }
    }
    // Fall back to `which`
    if let Ok(out) = Command::new("which").arg(name).output() {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    None
}

#[tauri::command]
fn detect_editors() -> Vec<String> {
    let mut found = vec![];
    if is_editor_installed("code", "/Applications/Visual Studio Code.app") {
        found.push("vscode".to_string());
    }
    if is_editor_installed("cursor", "/Applications/Cursor.app") {
        found.push("cursor".to_string());
    }
    found
}

fn is_editor_installed(cli: &str, mac_app_path: &str) -> bool {
    #[cfg(target_os = "macos")]
    if Path::new(mac_app_path).exists() {
        return true;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = mac_app_path;
    find_cli(cli).is_some()
}

#[tauri::command]
async fn open_ssh_editor(
    editor: String,
    user: String,
    host: String,
    port: u16,
    path: String,
) -> Result<(), String> {
    let remote = if port == 22 {
        format!("ssh-remote+{}@{}", user, host)
    } else {
        // VS Code SSH remote doesn't support custom ports directly via the --remote flag;
        // use an ssh config alias approach. For now encode host:port.
        format!("ssh-remote+{}@{}:{}", user, host, port)
    };

    let cli = match editor.as_str() {
        "vscode" => find_cli("code").ok_or_else(|| "VS Code CLI (code) not found in PATH".to_string())?,
        "cursor" => find_cli("cursor").ok_or_else(|| "Cursor CLI (cursor) not found in PATH".to_string())?,
        _ => return Err(format!("Unknown editor: {}", editor)),
    };

    Command::new(&cli)
        .args(["--remote", &remote, &path])
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {}", cli, e))?;

    Ok(())
}

#[tauri::command]
fn open_url(url: String) {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return;
    }
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let _ = Command::new("cmd").args(["/C", "start", "", &url]).spawn();
    #[cfg(target_os = "linux")]
    let _ = Command::new("xdg-open").arg(&url).spawn();
}

fn huxflux_dir() -> Option<String> {
    std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok()
}

fn read_update_channel() -> String {
    let home = match huxflux_dir() {
        Some(h) => h,
        None => return "stable".to_string(),
    };
    let settings_path = Path::new(&home).join("huxflux").join("settings.json");
    let content = match std::fs::read_to_string(&settings_path) {
        Ok(c) => c,
        Err(_) => return "stable".to_string(),
    };
    let parsed: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return "stable".to_string(),
    };
    match parsed.get("updateChannel").and_then(|v| v.as_str()) {
        Some("beta") => "beta".to_string(),
        _ => "stable".to_string(),
    }
}

fn updater_endpoint(channel: &str) -> String {
    let manifest = if channel == "beta" { "latest-beta.json" } else { "latest.json" };
    format!("https://github.com/MinutHQ/huxflux/releases/latest/download/{}", manifest)
}

#[derive(Serialize, Clone)]
struct UpdateCheckResult {
    available: bool,
    version: String,
    current_version: String,
}

#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    let channel = read_update_channel();
    let endpoint = updater_endpoint(&channel);
    let url: Url = endpoint.parse().map_err(|e: url::ParseError| e.to_string())?;

    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let update = updater.check().await.map_err(|e| e.to_string())?;
    match update {
        Some(u) => Ok(UpdateCheckResult {
            available: true,
            version: u.version.clone(),
            current_version: u.current_version.clone(),
        }),
        None => Ok(UpdateCheckResult {
            available: false,
            version: String::new(),
            current_version: app.config().version.clone().unwrap_or_default(),
        }),
    }
}

#[tauri::command]
async fn download_and_install_update(app: tauri::AppHandle) -> Result<(), String> {
    let channel = read_update_channel();
    let endpoint = updater_endpoint(&channel);
    let url: Url = endpoint.parse().map_err(|e: url::ParseError| e.to_string())?;

    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let update = updater.check().await.map_err(|e| e.to_string())?;
    match update {
        Some(u) => {
            u.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err("No update available".to_string()),
    }
}

#[tauri::command]
fn read_local_connection() -> Option<String> {
    let home = huxflux_dir()?;
    let path = Path::new(&home).join("huxflux").join("connection.json");
    std::fs::read_to_string(path).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let home = huxflux_dir().unwrap_or_default();
            let conn_path = Path::new(&home).join("huxflux").join("connection.json");
            if let Ok(json) = std::fs::read_to_string(&conn_path) {
                let escaped = json.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', "\\n");
                let script = format!("window.__huxflux_connection = '{}';", escaped);
                if let Some(window) = app.get_webview_window("main") {
                    let _: Result<(), _> = window.eval(&script);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![detect_editors, open_ssh_editor, zoom_window, open_url, read_local_connection, check_update, download_and_install_update])
        .run(tauri::generate_context!())
        .expect("error while running huxflux desktop");
}
