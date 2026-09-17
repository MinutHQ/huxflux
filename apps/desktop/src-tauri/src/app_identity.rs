use tauri::Manager;

#[tauri::command]
pub async fn send_desktop_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    icon: String,
    name: Option<String>,
) -> Result<(), String> {
    if !matches!(icon.as_str(), "default" | "ship") {
        return Err("Unknown app icon".into());
    }
    let name = name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            app.config()
                .product_name
                .clone()
                .unwrap_or_else(|| "Huxflux".into())
        });
    if name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err("Invalid app name".into());
    }
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            send_macos_notification(&app, &title, &body, &icon, &name)
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "macos")]
fn send_macos_notification(
    app: &tauri::AppHandle,
    title: &str,
    body: &str,
    icon: &str,
    name: &str,
) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::os::unix::fs::PermissionsExt;
    static SENDER_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = SENDER_LOCK.lock().map_err(|e| e.to_string())?;
    // A separate sender keeps the installed app's signed resources intact.
    // A different identity per appearance avoids Notification Center's icon cache.
    let hash = format!(
        "{:x}",
        Sha256::digest(format!("{name}\0{icon}\0full-size-v5"))
    );
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("notification-senders")
        .join(&hash);
    let bundle = directory.join("Notification.app");
    let executable = bundle.join("Contents/MacOS/notification-sender");
    let helper = include_bytes!(concat!(env!("OUT_DIR"), "/notification-sender"));
    let revision = format!("{:x}", Sha256::digest(helper));
    let ready = directory.join("ready");
    if !executable.exists()
        || std::fs::read_to_string(&ready).ok().as_deref() != Some(revision.as_str())
    {
        // A failed or interrupted preparation must be retried, including signing.
        if bundle.exists() {
            std::fs::remove_dir_all(&bundle).map_err(|e| e.to_string())?;
        }
        std::fs::create_dir_all(bundle.join("Contents/MacOS")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(bundle.join("Contents/Resources")).map_err(|e| e.to_string())?;
        let mut info = plist::Dictionary::new();
        for (key, value) in [
            (
                "CFBundleIdentifier",
                format!("{}.notifications.{}", app.config().identifier, &hash[..16]),
            ),
            ("CFBundleName", name.to_string()),
            ("CFBundleDisplayName", name.to_string()),
            ("CFBundleExecutable", "notification-sender".into()),
            ("CFBundlePackageType", "APPL".into()),
            ("CFBundleIconFile", "icon.icns".into()),
            ("CFBundleVersion", "1".into()),
        ] {
            info.insert(key.into(), plist::Value::String(value));
        }
        info.insert("LSUIElement".into(), plist::Value::Boolean(true));
        plist::Value::Dictionary(info)
            .to_file_xml(bundle.join("Contents/Info.plist"))
            .map_err(|e| e.to_string())?;
        let image: &[u8] = if icon == "ship" {
            include_bytes!("../icons/ship-notification.icns")
        } else if app.config().identifier.ends_with(".dev") {
            include_bytes!("../icons/dev/icon.icns")
        } else {
            include_bytes!("../icons/icon.icns")
        };
        std::fs::write(bundle.join("Contents/Resources/icon.icns"), image)
            .map_err(|e| e.to_string())?;
        std::fs::write(&executable, helper).map_err(|e| e.to_string())?;
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
        let output = std::process::Command::new("/usr/bin/codesign")
            .args(["--force", "--sign", "-"])
            .arg(&bundle)
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).into_owned());
        }
        std::fs::write(&ready, revision).map_err(|e| e.to_string())?;
    }
    // Register only our generated sender, never touch global icon caches.
    let output = std::process::Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .arg("-f").arg(&bundle).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Could not register the notification sender".into());
    }
    let output = std::process::Command::new(&executable)
        .args([title, body])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Notification delivery failed. Check notification permissions for {name}. {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[tauri::command]
pub async fn set_app_name(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let name = name.trim();
    if name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err("Use an app name of at most 64 characters without control characters".into());
    }
    let name = if name.is_empty() {
        app.config()
            .product_name
            .clone()
            .unwrap_or_else(|| "Huxflux".into())
    } else {
        name.to_string()
    };
    #[cfg(target_os = "macos")]
    {
        let (sender, mut receiver) = tauri::async_runtime::channel(1);
        let name = name.clone();
        app.run_on_main_thread(move || {
            let _ = sender.try_send(set_macos_name(&name));
        })
        .map_err(|e| e.to_string())?;
        receiver
            .recv()
            .await
            .ok_or("App rename was interrupted")??;
    }
    for window in app.webview_windows().values() {
        window.set_title(&name).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_macos_name(name: &str) -> Result<(), String> {
    use objc::{class, msg_send, runtime::Object, sel, sel_impl};
    use std::ffi::{c_void, CString};
    extern "C" {
        fn dlsym(handle: *mut c_void, symbol: *const i8) -> *mut c_void;
    }
    unsafe {
        // Runtime display name only: do not alter signed bundle resources or the
        // process name (which Foundation may use as a preferences domain).
        let get = dlsym(
            -2isize as *mut c_void,
            c"_LSGetCurrentApplicationASN".as_ptr(),
        );
        let set = dlsym(
            -2isize as *mut c_void,
            c"_LSSetApplicationInformationItem".as_ptr(),
        );
        let key = dlsym(-2isize as *mut c_void, c"_kLSDisplayNameKey".as_ptr());
        if get.is_null() || set.is_null() || key.is_null() {
            return Err("This macOS version does not support changing the running app name".into());
        }
        let get: unsafe extern "C" fn() -> *const c_void = std::mem::transmute(get);
        let set: unsafe extern "C" fn(
            i32,
            *const c_void,
            *const c_void,
            *const c_void,
            *mut c_void,
        ) -> i32 = std::mem::transmute(set);
        let asn = get();
        if asn.is_null() {
            return Err("Could not find the running app identity".into());
        }
        let text = CString::new(name).map_err(|e| e.to_string())?;
        let allocated: *mut Object = msg_send![class!(NSString), alloc];
        let value: *mut Object = msg_send![allocated, initWithUTF8String: text.as_ptr()];
        let status = set(
            -2,
            asn,
            *(key as *const *const c_void),
            value.cast(),
            std::ptr::null_mut(),
        );
        if status == 0 {
            let application: *mut Object = msg_send![class!(NSApplication), sharedApplication];
            let menu: *mut Object = msg_send![application, mainMenu];
            let count: isize = msg_send![menu, numberOfItems];
            if count > 0 {
                let item: *mut Object = msg_send![menu, itemAtIndex: 0isize];
                let submenu: *mut Object = msg_send![item, submenu];
                let _: () = msg_send![item, setTitle: value];
                let _: () = msg_send![submenu, setTitle: value];
                let items: isize = msg_send![submenu, numberOfItems];
                for index in 0..items {
                    let entry: *mut Object = msg_send![submenu, itemAtIndex: index];
                    let action: objc::runtime::Sel = msg_send![entry, action];
                    let prefix = if action == sel!(hide:) {
                        Some("Hide")
                    } else if action == sel!(terminate:) {
                        Some("Quit")
                    } else if index == 0 {
                        Some("About")
                    } else {
                        None
                    };
                    if let Some(prefix) = prefix {
                        let label =
                            CString::new(format!("{prefix} {name}")).map_err(|e| e.to_string())?;
                        let allocated: *mut Object = msg_send![class!(NSString), alloc];
                        let label: *mut Object =
                            msg_send![allocated, initWithUTF8String: label.as_ptr()];
                        let _: () = msg_send![entry, setTitle: label];
                        let _: () = msg_send![label, release];
                    }
                }
            }
        }
        let _: () = msg_send![value, release];
        if status == 0 {
            Ok(())
        } else {
            Err(format!("macOS rejected the app name ({status})"))
        }
    }
}
