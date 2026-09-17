use std::path::Path;
use std::process::Command;
use serde::Serialize;
use serde_json::Value;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;
use url::Url;
mod app_identity;

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

// AppKit must run on the main thread. Await completion so the picker only saves
// a selection after both the bundle icon and running Dock icon have changed.
#[tauri::command]
async fn set_app_icon(app: tauri::AppHandle, icon: String) -> Result<(), String> {
    if !matches!(icon.as_str(), "default" | "ship") {
        return Err("Unknown app icon".into());
    }
    #[cfg(target_os = "macos")]
    {
        let (sender, mut receiver) = tauri::async_runtime::channel(1);
        app.run_on_main_thread(move || {
            let _ = sender.try_send(apply_macos_app_icon(&icon));
        }).map_err(|e| e.to_string())?;
        receiver.recv().await.ok_or("App icon update was interrupted")?
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = app; Ok(()) }
}

#[cfg(target_os = "macos")]
fn apply_macos_app_icon(icon: &str) -> Result<(), String> {
    use objc::{class, msg_send, runtime::{Object, BOOL, NO}, sel, sel_impl};
    unsafe {
        let pool: *mut Object = msg_send![class!(NSAutoreleasePool), new];
        let image: *mut Object = if icon == "ship" {
            let bytes = include_bytes!("../icons/ship.png");
            let data: *mut Object = msg_send![class!(NSData), dataWithBytes: bytes.as_ptr() length: bytes.len()];
            let allocated: *mut Object = msg_send![class!(NSImage), alloc];
            msg_send![allocated, initWithData: data]
        } else {
            std::ptr::null_mut()
        };
        let result = (|| {
            if icon == "ship" && image.is_null() {
                return Err("Could not load the selected app icon".into());
            }
            let bundle: *mut Object = msg_send![class!(NSBundle), mainBundle];
            let bundle_path: *mut Object = msg_send![bundle, bundlePath];
            let path: *const std::os::raw::c_char = msg_send![bundle_path, UTF8String];
            let is_bundle = !path.is_null()
                && Path::new(std::ffi::CStr::from_ptr(path).to_str().unwrap_or(""))
                    .extension().is_some_and(|extension| extension == "app");
            if is_bundle {
                // Custom file metadata leaves the shipped resources and Info.plist
                // intact. nil removes the override and restores this build's icon.
                let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
                let changed: BOOL = msg_send![workspace, setIcon: image forFile: bundle_path options: 0usize];
                if changed == NO {
                    return Err("macOS could not change the app icon. Move the app to a writable folder and try again.".into());
                }
            } else if !tauri::is_dev() {
                return Err("Could not locate the running app bundle".into());
            }
            // Unbundled `tauri dev` has no app file to customize, so only its Dock
            // icon can change. Packaged debug builds take the bundle path above.
            let app: *mut Object = msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![app, setApplicationIconImage: image];
            Ok(())
        })();
        if !image.is_null() {
            let _: () = msg_send![image, release];
        }
        let _: () = msg_send![pool, drain];
        result
    }
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

const GITHUB_REPO: &str = "MinutHQ/huxflux";

async fn updater_endpoint(channel: &str) -> String {
    if channel != "beta" {
        return format!("https://github.com/{}/releases/latest/download/latest.json", GITHUB_REPO);
    }
    match latest_beta_tag().await {
        Some(tag) => format!("https://github.com/{}/releases/download/{}/latest-beta.json", GITHUB_REPO, tag),
        None => format!("https://github.com/{}/releases/latest/download/latest.json", GITHUB_REPO),
    }
}

async fn latest_beta_tag() -> Option<String> {
    if let Some(tag) = latest_beta_tag_via_server().await {
        return Some(tag);
    }
    latest_beta_tag_via_github().await
}

async fn latest_beta_tag_via_server() -> Option<String> {
    let home = huxflux_dir()?;
    let conn_path = std::path::Path::new(&home).join("huxflux").join("connection.json");
    let content = std::fs::read_to_string(conn_path).ok()?;
    let conn: Value = serde_json::from_str(&content).ok()?;
    let base_url = conn.get("url").and_then(|v| v.as_str())?;
    let token = conn.get("token").and_then(|v| v.as_str())?;
    let url = format!("{}/api/system/latest-beta-tag", base_url);
    let resp: Value = reqwest::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send().await.ok()?
        .json().await.ok()?;
    resp.get("tag").and_then(|v| v.as_str()).map(|s| s.to_string())
}

async fn latest_beta_tag_via_github() -> Option<String> {
    let url = format!("https://api.github.com/repos/{}/releases?per_page=15", GITHUB_REPO);
    let resp: Value = reqwest::Client::new()
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "huxflux-desktop")
        .send().await.ok()?.json().await.ok()?;
    let releases = resp.as_array()?;
    for r in releases {
        let is_prerelease = r.get("prerelease").and_then(|v| v.as_bool()).unwrap_or(false);
        let is_draft = r.get("draft").and_then(|v| v.as_bool()).unwrap_or(true);
        if is_prerelease && !is_draft {
            return r.get("tag_name").and_then(|v| v.as_str()).map(|s| s.to_string());
        }
    }
    None
}

#[derive(Serialize, Clone)]
struct UpdateCheckResult {
    available: bool,
    version: String,
    current_version: String,
}

#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    if app.config().identifier == "com.huxflux.desktop.dev" {
        return Err("Updates are disabled in Huxflux Dev".into());
    }
    let channel = read_update_channel();
    let endpoint = updater_endpoint(&channel).await;
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
    if app.config().identifier == "com.huxflux.desktop.dev" {
        return Err("Updates are disabled in Huxflux Dev".into());
    }
    let channel = read_update_channel();
    let endpoint = updater_endpoint(&channel).await;
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
fn read_local_connection(app: tauri::AppHandle) -> Option<String> {
    // The shared connection file may point to production. Dev connects explicitly.
    if app.config().identifier == "com.huxflux.desktop.dev" { return None; }
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
            if let Some(json) = read_local_connection(app.handle().clone()) {
                let escaped = json.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', "\\n");
                let script = format!("window.__huxflux_connection = '{}';", escaped);
                if let Some(window) = app.get_webview_window("main") {
                    let _: Result<(), _> = window.eval(&script);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![detect_editors, open_ssh_editor, zoom_window, set_app_icon, app_identity::set_app_name, app_identity::send_desktop_notification, open_url, read_local_connection, check_update, download_and_install_update])
        .run(tauri::generate_context!())
        .expect("error while running huxflux desktop");
}
