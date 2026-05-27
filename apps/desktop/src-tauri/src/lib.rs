use std::path::Path;
use std::process::Command;
use tauri::Manager;

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

#[tauri::command]
fn read_local_connection() -> Option<String> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok()?;
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
            // Inject connection.json into the webview so the frontend can read it
            // synchronously before the router loads (avoids the onboarding flash).
            let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default();
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
        .invoke_handler(tauri::generate_handler![detect_editors, open_ssh_editor, zoom_window, open_url, read_local_connection])
        .run(tauri::generate_context!())
        .expect("error while running huxflux desktop");
}
