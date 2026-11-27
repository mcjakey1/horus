use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;

const FILE: &str = "settings.json";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

/// `Unset` means the first-run question has not been answered yet (Plan 5).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum FindSimilar {
    #[default]
    Unset,
    On,
    Off,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub last_library: Option<String>,
    pub theme: Theme,
    pub find_similar: FindSimilar,
    /// Plan 6 Task 4: the intro played once (or was skipped); "Play intro" never changes it.
    pub intro_seen: bool,
}

/// What `set_settings` receives: only the present fields change, so a theme toggle never
/// wipes `lastLibrary`. A full `Settings` is a valid patch (`lastLibrary: null` = keep).
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsPatch {
    pub last_library: Option<String>,
    pub theme: Option<Theme>,
    pub find_similar: Option<FindSimilar>,
    pub intro_seen: Option<bool>,
}

impl Settings {
    pub fn merge(&mut self, p: SettingsPatch) {
        if p.last_library.is_some() {
            self.last_library = p.last_library;
        }
        if let Some(t) = p.theme {
            self.theme = t;
        }
        if let Some(f) = p.find_similar {
            self.find_similar = f;
        }
        if let Some(seen) = p.intro_seen {
            self.intro_seen = seen;
        }
    }
}

/// A missing or unreadable file gives the defaults: settings are never worth failing over.
pub fn load(dir: &Path) -> Settings {
    std::fs::read(dir.join(FILE))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

/// Atomic: write a temp file in the same folder, fsync it, then rename it over settings.json.
pub fn save(dir: &Path, s: &Settings) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(&serde_json::to_vec_pretty(s).map_err(std::io::Error::other)?)?;
    tmp.as_file().sync_all()?;
    tmp.persist(dir.join(FILE)).map_err(|e| e.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_without_intro_keeps_it() {
        let mut s = Settings {
            intro_seen: true,
            ..Settings::default()
        };
        s.merge(SettingsPatch {
            theme: Some(Theme::Dark),
            ..SettingsPatch::default()
        });
        assert!(s.intro_seen, "a patch without introSeen keeps it");
        let mut fresh = Settings::default();
        assert!(!fresh.intro_seen);
        let p: SettingsPatch = serde_json::from_str(r#"{"introSeen":true}"#).unwrap();
        fresh.merge(p);
        assert!(fresh.intro_seen);
        // An old settings.json without the key loads as not seen: the intro plays once.
        let old: Settings = serde_json::from_str(r#"{"theme":"light"}"#).unwrap();
        assert!(!old.intro_seen);
    }
}
