fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/notification_sender.m");
        let output = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap())
            .join("notification-sender");
        let arch = if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("aarch64") {
            "arm64"
        } else {
            "x86_64"
        };
        let status = std::process::Command::new("clang")
            .args([
                "-arch",
                arch,
                "-mmacosx-version-min=11.0",
                "-framework",
                "AppKit",
                "-Wno-deprecated-declarations",
                "src/notification_sender.m",
                "-o",
            ])
            .arg(output)
            .status()
            .expect("could not compile notification sender");
        assert!(status.success(), "notification sender compilation failed");
    }
    tauri_build::build()
}
