use std::path::Path;

/// WebKitGTK disables GPU rendering when it detects the proprietary NVIDIA
/// driver, so every frame is painted on the CPU (blur and animation then peg a
/// core). Force its DMA-BUF renderer back on, handing frames over through shared
/// memory, which avoids the blank-window bug the hardware buffer path hits on
/// NVIDIA. Skipped when the user already set any of these variables, so
/// `WEBKIT_DISABLE_DMABUF_RENDERER=1` remains the escape hatch.
///
/// The device node exists whenever the proprietary module is loaded, so hybrid
/// laptops rendering on their integrated GPU take the shared-memory path too.
/// That costs one frame copy and still composites, so it is not worth narrowing.
///
/// Must run before Tauri starts, while the process is still single-threaded:
/// that invariant is what makes `set_var` sound, and it becomes an `unsafe fn`
/// in edition 2024.
pub fn enable_gpu_rendering_on_nvidia() {
    const OVERRIDES: [&str; 3] = [
        "WEBKIT_DISABLE_DMABUF_RENDERER",
        "WEBKIT_FORCE_DMABUF_RENDERER",
        "WEBKIT_DMABUF_RENDERER_FORCE_SHM",
    ];
    if OVERRIDES.iter().any(|name| std::env::var_os(name).is_some()) {
        return;
    }
    if !Path::new("/dev/nvidiactl").exists() {
        return;
    }
    std::env::set_var("WEBKIT_FORCE_DMABUF_RENDERER", "1");
    std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
}
