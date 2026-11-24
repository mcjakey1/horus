fn main() {
    // Tauri embeds its Common-Controls v6 manifest in the app binary only, so unit-test
    // binaries that link tauri (tauri::test) die with STATUS_ENTRYPOINT_NOT_FOUND. Embed the
    // same manifest through the linker instead, which covers every target, tests included.
    let msvc = std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    let mut attrs = tauri_build::Attributes::new();
    if msvc {
        attrs =
            attrs.windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
