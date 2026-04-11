// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // In dev mode the binary runs outside a .app bundle, so macOS may treat it
    // as a background-only process (no dock icon, no keyboard focus). Force it
    // to register as a regular foreground app before Tauri creates the window.
    #[cfg(all(debug_assertions, target_os = "macos"))]
    {
        use objc::{msg_send, runtime::Object, sel, sel_impl, class};
        unsafe {
            let app: *mut Object = msg_send![class!(NSApplication), sharedApplication];
            // 0 = NSApplicationActivationPolicyRegular (dock icon + menu bar)
            let _: () = msg_send![app, setActivationPolicy: 0i64];
        }
    }

    huxflux_desktop_lib::run()
}
