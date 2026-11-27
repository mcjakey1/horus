//! Plan 4 Task 2: copy a board's originals into a folder, for PureRef, Photoshop or Figma.
//! Bytes only: nothing is decoded, and no original is ever moved or modified (SPEC §9).
//! Nothing in `dest` is ever overwritten: names that are taken get ` (2)`, ` (3)` and so on.

use crate::library::image_path_in;
use crate::model::{Board, Reference};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;
use tempfile::NamedTempFile;

const OUTSIDE: &str = "Choose a folder outside the library.";
const MAX_STEM: usize = 120;

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    /// Image file names only, in board order.
    pub written: Vec<String>,
    /// The credits file's name, when it was written.
    pub credits: Option<String>,
    /// (reference id, reason). Serialises as `[string, string][]`.
    pub skipped: Vec<(String, String)>,
}

/// Copies `board`'s originals into `dest` as `<NN> - <title>.<ext>`, then writes the credits
/// file. `refs` are the board's members in board order (cloned off the state lock by the
/// caller). One failed item is skipped with a reason; the rest carry on.
pub fn export_board(
    root: &Path,
    board: &Board,
    refs: &[Reference],
    dest: &Path,
) -> Result<ExportReport, String> {
    // Canonical on both sides: case, `..` and the Windows `\\?\` prefix compare equal.
    let dest = fs::canonicalize(dest)
        .ok()
        .filter(|d| d.is_dir())
        .ok_or(OUTSIDE)?; // the brief's one message for "missing" and "inside"
    let root = fs::canonicalize(root).map_err(|e| format!("The library can't be read: {e}"))?;
    if dest.starts_with(&root) {
        return Err(OUTSIDE.into());
    }
    let mut taken: HashSet<String> = fs::read_dir(&dest)
        .map_err(|e| format!("That folder can't be read: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_lowercase())
        .collect();

    let by_id: HashMap<&str, &Reference> = refs.iter().map(|r| (r.id.as_str(), r)).collect();
    let width = board.reference_ids.len().to_string().len();
    let mut report = ExportReport::default();
    let mut entries: Vec<(String, &Reference)> = vec![];
    for (i, id) in board.reference_ids.iter().enumerate() {
        let Some(r) = by_id.get(id.as_str()) else {
            report
                .skipped
                .push((id.clone(), "It is no longer in the library.".into()));
            continue;
        };
        let copied = image_path_in(&root, &r.file)
            .map_err(|e| e.to_string())
            .and_then(|src| {
                let ext = r.file.rsplit_once('.').map_or("", |(_, e)| e);
                let name = safe_name(&format!("{:0width$} - {}", i + 1, r.title), ext, &taken);
                let mut original = File::open(&src)
                    .map_err(|e| format!("The original is missing or unreadable: {e}"))?;
                write_new(&dest, &name, |f| io::copy(&mut original, f).map(drop))?;
                Ok(name)
            });
        match copied {
            Ok(name) => {
                taken.insert(name.to_lowercase());
                report.written.push(name.clone());
                entries.push((name, r));
            }
            Err(why) => report.skipped.push((id.clone(), why)),
        }
    }

    let name = safe_name("credits", "txt", &taken);
    let text = credits_text(board, &entries);
    // ponytail: a credits file that fails to write leaves `credits: None`; the images stand.
    if write_new(&dest, &name, |f| f.write_all(text.as_bytes())).is_ok() {
        report.credits = Some(name);
    }
    Ok(report)
}

/// Writes through a temp file in `dir` (never an existing name), then persists without
/// clobbering. On any failure the temp file is dropped, which deletes it.
fn write_new(
    dir: &Path,
    name: &str,
    fill: impl FnOnce(&mut File) -> io::Result<()>,
) -> Result<(), String> {
    let mut tmp =
        NamedTempFile::new_in(dir).map_err(|e| format!("That folder can't be written: {e}"))?;
    fill(tmp.as_file_mut())
        .and_then(|()| tmp.as_file().sync_all())
        .map_err(|e| format!("Could not write {name}: {e}"))?;
    // D18: a temp file is 0600 on macOS and Linux; an export is for sharing, so 0644.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        tmp.as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o644))
            .map_err(|e| format!("Could not write {name}: {e}"))?;
    }
    tmp.persist_noclobber(dir.join(name))
        .map(drop)
        .map_err(|e| format!("Could not save {name}: {}", e.error))
}

fn reserved(stem: &str) -> bool {
    let u = stem.to_ascii_uppercase();
    matches!(u.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (u.len() == 4
            && (u.starts_with("COM") || u.starts_with("LPT"))
            && matches!(u.as_bytes()[3], b'1'..=b'9'))
}

/// A file name valid on Windows, macOS and Linux, not in `taken` (lowercased full names).
pub fn safe_name(stem: &str, ext: &str, taken: &HashSet<String>) -> String {
    let cut: String = stem
        .chars()
        .map(|c| {
            if c.is_control() || r#"<>:"/\|?*"#.contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(MAX_STEM)
        .collect();
    let trimmed = cut.trim_end_matches(['.', ' ']);
    let mut base = if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed.to_string()
    };
    if reserved(&base) {
        base.insert(0, '_');
    }
    let mut name = format!("{base}.{ext}");
    let mut n = 2;
    while taken.contains(&name.to_lowercase()) {
        name = format!("{base} ({n}).{ext}");
        n += 1;
    }
    name
}

/// `\r` and `\n` become spaces, so every field stays on one line.
fn flat(s: &str) -> String {
    s.replace(['\r', '\n'], " ")
}

/// A missing (or blank) field prints `—`.
fn field(v: &Option<String>) -> String {
    v.as_deref()
        .filter(|s| !s.trim().is_empty())
        .map_or("\u{2014}".into(), flat)
}

/// The credits file: a header, then one block per written image, separated by blank lines,
/// ending in exactly one `\n`.
pub fn credits_text(board: &Board, entries: &[(String, &Reference)]) -> String {
    let mut out = format!("Horus board: {}\n", flat(&board.name));
    for (name, r) in entries {
        out.push_str(&format!(
            "\n{}\nTitle: {}\nCreator: {}\nYear: {}\nCredit: {}\nSource: {}\n",
            flat(name),
            flat(&r.title),
            field(&r.creator),
            field(&r.year),
            field(&r.credit),
            field(&r.source_url),
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    #[test]
    fn exports_are_readable_by_others_on_unix() {
        // D18: not the temp file's 0600.
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        write_new(dir.path(), "a.txt", |f| f.write_all(b"x")).unwrap();
        let mode = std::fs::metadata(dir.path().join("a.txt"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o644);
    }

    use super::*;
    use crate::import::import_paths;
    use crate::library::image_path_in;
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    /// A temp library with 3 imported fixtures, titled in `titles` order, and one board of all three.
    struct Lib {
        _dir: tempfile::TempDir,
        root: PathBuf,
        refs: Vec<Reference>,
        board: Board,
    }

    fn lib(titles: [&str; 3]) -> Lib {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Library");
        let paths: Vec<PathBuf> = ["small.jpg", "rotated.jpg", "p3_red.png"]
            .iter()
            .map(|n| fixture(n))
            .collect();
        let mut refs = import_paths(&root, &HashMap::new(), &paths).references;
        assert_eq!(refs.len(), 3, "three distinct fixtures import");
        for (r, t) in refs.iter_mut().zip(titles) {
            r.title = t.into();
        }
        let board = Board {
            id: "b1".into(),
            name: "Harbour".into(),
            reference_ids: refs.iter().map(|r| r.id.clone()).collect(),
        };
        Lib {
            _dir: dir,
            root,
            refs,
            board,
        }
    }

    fn ext(r: &Reference) -> &str {
        r.file.rsplit_once('.').unwrap().1
    }

    fn names_in(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    fn reference(title: &str) -> Reference {
        Reference {
            id: format!("id-{title}"),
            title: title.into(),
            creator: None,
            year: None,
            source_url: None,
            credit: None,
            note: None,
            file: format!("{}.jpg", "a".repeat(64)),
            hash: "a".repeat(64),
            width: 1,
            height: 1,
            added_at: "2026-11-26T00:00:00Z".into(),
            tags: vec![],
        }
    }

    #[test]
    fn exports_in_board_order() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let originals: Vec<Vec<u8>> = l
            .refs
            .iter()
            .map(|r| fs::read(image_path_in(&l.root, &r.file).unwrap()).unwrap())
            .collect();
        let dest = tempfile::tempdir().unwrap();
        let rep = export_board(&l.root, &l.board, &l.refs, dest.path()).unwrap();
        let want: Vec<String> = l
            .refs
            .iter()
            .zip(["1 - Harbour", "2 - Pier", "3 - Gull"])
            .map(|(r, stem)| format!("{stem}.{}", ext(r)))
            .collect();
        assert_eq!(rep.written, want);
        assert!(rep.skipped.is_empty());
        for ((r, name), before) in l.refs.iter().zip(&rep.written).zip(&originals) {
            let after = fs::read(image_path_in(&l.root, &r.file).unwrap()).unwrap();
            assert_eq!(&after, before, "the original is unchanged (SPEC §9)");
            assert_eq!(
                &fs::read(dest.path().join(name)).unwrap(),
                before,
                "{name} is byte-identical"
            );
        }
    }

    #[test]
    fn never_overwrites() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let dest = tempfile::tempdir().unwrap();
        let old = format!("1 - Harbour.{}", ext(&l.refs[0]));
        fs::write(dest.path().join(&old), b"keep me").unwrap();
        let rep = export_board(&l.root, &l.board, &l.refs, dest.path()).unwrap();
        assert_eq!(
            rep.written[0],
            format!("1 - Harbour (2).{}", ext(&l.refs[0]))
        );
        assert_eq!(fs::read(dest.path().join(&old)).unwrap(), b"keep me");
    }

    #[test]
    fn safe_name_cases() {
        let none = HashSet::new();
        assert_eq!(safe_name("a:b?c", "jpg", &none), "a_b_c.jpg");
        assert_eq!(safe_name("CON", "jpg", &none), "_CON.jpg");
        assert_eq!(safe_name("lpt9", "jpg", &none), "_lpt9.jpg");
        assert_eq!(safe_name("trailing. ", "jpg", &none), "trailing.jpg");
        let long = safe_name(&"x".repeat(300), "jpg", &none);
        assert_eq!(long, format!("{}.jpg", "x".repeat(120)));
        // The cut at 120 lands inside a run of dots: the dots it exposes are trimmed.
        let dotted = safe_name(&format!("{}....tail", "a".repeat(118)), "jpg", &none);
        assert_eq!(dotted, format!("{}.jpg", "a".repeat(118)));
        assert_eq!(safe_name("...", "jpg", &none), "untitled.jpg");
        assert_eq!(safe_name("Étude", "jpg", &none), "Étude.jpg");
        assert_eq!(safe_name("tab\there", "jpg", &none), "tab_here.jpg");
        assert_eq!(
            safe_name("a<b>c\"d/e\\f|g*h", "png", &none),
            "a_b_c_d_e_f_g_h.png"
        );
    }

    #[test]
    fn duplicate_titles_get_suffix() {
        let l = lib(["Study", "Study", "Gull"]);
        let dest = tempfile::tempdir().unwrap();
        let rep = export_board(&l.root, &l.board, &l.refs, dest.path()).unwrap();
        assert_eq!(rep.written[0], format!("1 - Study.{}", ext(&l.refs[0])));
        assert_eq!(rep.written[1], format!("2 - Study.{}", ext(&l.refs[1])));
        let taken: HashSet<String> = ["study.jpg".to_string()].into();
        assert_eq!(safe_name("Study", "jpg", &taken), "Study (2).jpg");
        let taken: HashSet<String> = ["study.jpg".to_string(), "study (2).jpg".to_string()].into();
        assert_eq!(safe_name("STUDY", "jpg", &taken), "STUDY (3).jpg");
    }

    #[test]
    fn missing_original_skipped() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        fs::remove_file(image_path_in(&l.root, &l.refs[1].file).unwrap()).unwrap();
        let dest = tempfile::tempdir().unwrap();
        let rep = export_board(&l.root, &l.board, &l.refs, dest.path()).unwrap();
        assert_eq!(rep.skipped.len(), 1);
        assert_eq!(rep.skipped[0].0, l.refs[1].id);
        assert!(!rep.skipped[0].1.is_empty(), "a stated reason");
        let mut want = vec![
            format!("1 - Harbour.{}", ext(&l.refs[0])),
            format!("3 - Gull.{}", ext(&l.refs[2])),
        ];
        assert_eq!(rep.written, want);
        want.push("credits.txt".into());
        want.sort();
        assert_eq!(
            names_in(dest.path()),
            want,
            "no leftover temp file of any name"
        );
    }

    #[test]
    fn member_without_reference_skipped() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let mut board = l.board.clone();
        board.reference_ids.insert(1, "gone".into());
        let dest = tempfile::tempdir().unwrap();
        let rep = export_board(&l.root, &board, &l.refs, dest.path()).unwrap();
        assert_eq!(rep.skipped.len(), 1);
        assert_eq!(rep.skipped[0].0, "gone");
        // Positions stay the board's: the third member is 3, not 2.
        assert_eq!(rep.written[1], format!("3 - Pier.{}", ext(&l.refs[1])));
    }

    #[test]
    fn dest_inside_library_refused() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let images = l.root.join("images");
        assert_eq!(
            export_board(&l.root, &l.board, &l.refs, &images).unwrap_err(),
            "Choose a folder outside the library."
        );
        let dotted = l.root.join("images").join("..").join("images");
        let refused = |d: &Path| export_board(&l.root, &l.board, &l.refs, d).unwrap_err();
        assert_eq!(refused(&dotted), OUTSIDE, "a `..` segment");
        assert_eq!(refused(&l.root), OUTSIDE, "the root itself");
        // Case-insensitive file systems (Windows, default macOS) find the same folder; on Linux
        // it doesn't exist, which gives the same message.
        let upper = PathBuf::from(images.to_string_lossy().to_uppercase());
        assert_eq!(refused(&upper), OUTSIDE, "a different case");
    }

    #[test]
    fn missing_dest_refused() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let dest = tempfile::tempdir().unwrap();
        let missing = dest.path().join("nope");
        assert_eq!(
            export_board(&l.root, &l.board, &l.refs, &missing).unwrap_err(),
            OUTSIDE
        );
        let file = dest.path().join("a file");
        fs::write(&file, b"x").unwrap();
        assert_eq!(
            export_board(&l.root, &l.board, &l.refs, &file).unwrap_err(),
            OUTSIDE,
            "a file is not a folder"
        );
    }

    #[test]
    fn unicode_dest() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let base = tempfile::tempdir().unwrap();
        let dest = base.path().join("Références");
        fs::create_dir(&dest).unwrap();
        let rep = export_board(&l.root, &l.board, &l.refs, &dest).unwrap();
        assert_eq!(rep.written.len(), 3);
        assert!(dest.join(&rep.written[2]).is_file());
    }

    #[test]
    fn credits_text_exact() {
        let board = Board {
            id: "b".into(),
            name: "Harbour".into(),
            reference_ids: vec![],
        };
        let mut a = reference("Night pier");
        a.year = Some("1938".into());
        a.source_url = Some("https://example.org/pier".into());
        let mut b = reference("Gulls");
        b.creator = Some("A. Painter".into());
        b.credit = Some("line1\nline2".into());
        let text = credits_text(
            &board,
            &[
                ("1 - Night pier.jpg".into(), &a),
                ("2 - Gulls.png".into(), &b),
            ],
        );
        let want = "Horus board: Harbour\n\
                    \n\
                    1 - Night pier.jpg\n\
                    Title: Night pier\n\
                    Creator: \u{2014}\n\
                    Year: 1938\n\
                    Credit: \u{2014}\n\
                    Source: https://example.org/pier\n\
                    \n\
                    2 - Gulls.png\n\
                    Title: Gulls\n\
                    Creator: A. Painter\n\
                    Year: \u{2014}\n\
                    Credit: line1 line2\n\
                    Source: \u{2014}\n";
        assert_eq!(text, want);
    }

    #[test]
    fn credits_text_empty_board() {
        let board = Board {
            id: "b".into(),
            name: "Ships".into(),
            reference_ids: vec![],
        };
        assert_eq!(credits_text(&board, &[]), "Horus board: Ships\n");
    }

    #[test]
    fn credits_flatten_cr_too() {
        let board = Board {
            id: "b".into(),
            name: "Two\r\nlines".into(),
            reference_ids: vec![],
        };
        let mut a = reference("T\rx");
        a.note = Some("notes are not printed".into());
        let text = credits_text(&board, &[("1 - T_x.jpg".into(), &a)]);
        assert!(text.starts_with("Horus board: Two  lines\n"));
        assert!(text.contains("Title: T x\n"));
        assert!(!text.contains("notes are not printed"));
    }

    #[test]
    fn credits_file_written() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        fs::remove_file(image_path_in(&l.root, &l.refs[1].file).unwrap()).unwrap();
        let dest = tempfile::tempdir().unwrap();
        let rep = export_board(&l.root, &l.board, &l.refs, dest.path()).unwrap();
        assert_eq!(rep.credits.as_deref(), Some("credits.txt"));
        assert!(
            rep.written.iter().all(|n| !n.ends_with(".txt")),
            "images only"
        );
        let bytes = fs::read(dest.path().join("credits.txt")).unwrap();
        assert!(!bytes.starts_with(&[0xEF, 0xBB, 0xBF]), "no BOM");
        let text = String::from_utf8(bytes).unwrap();
        assert!(!text.contains('\r'));
        let first = text.find(&rep.written[0]).unwrap();
        let second = text.find(&rep.written[1]).unwrap();
        assert!(first < second, "board order");
        assert!(
            !text.contains("Title: Pier"),
            "the skipped reference has no block"
        );
        assert_eq!(text.matches("Title: ").count(), 2);
    }

    #[test]
    fn credits_written_for_empty_export() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let board = Board {
            id: "b2".into(),
            name: "Empty".into(),
            reference_ids: vec![],
        };
        let dest = tempfile::tempdir().unwrap();
        let rep = export_board(&l.root, &board, &l.refs, dest.path()).unwrap();
        assert!(rep.written.is_empty());
        assert_eq!(
            fs::read_to_string(dest.path().join("credits.txt")).unwrap(),
            "Horus board: Empty\n"
        );
    }

    #[test]
    fn credits_never_overwrites() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let dest = tempfile::tempdir().unwrap();
        fs::write(dest.path().join("credits.txt"), b"mine").unwrap();
        let rep = export_board(&l.root, &l.board, &l.refs, dest.path()).unwrap();
        assert_eq!(rep.credits.as_deref(), Some("credits (2).txt"));
        assert_eq!(fs::read(dest.path().join("credits.txt")).unwrap(), b"mine");
        assert!(dest.path().join("credits (2).txt").is_file());
    }

    #[test]
    fn padding_follows_board_size() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        let mut board = l.board.clone();
        // 10 members: 7 ids with no reference pad the board to two digits.
        for i in 0..7 {
            board.reference_ids.push(format!("gone{i}"));
        }
        let dest = tempfile::tempdir().unwrap();
        let rep = export_board(&l.root, &board, &l.refs, dest.path()).unwrap();
        assert_eq!(rep.written[0], format!("01 - Harbour.{}", ext(&l.refs[0])));
        assert_eq!(rep.skipped.len(), 7);
    }

    #[test]
    fn write_failure_leaves_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let err = write_new(dir.path(), "a.jpg", |_| Err(io::Error::other("disk full")));
        assert!(err.unwrap_err().contains("disk full"));
        assert!(names_in(dir.path()).is_empty(), "the temp file is gone");
    }

    #[test]
    fn write_never_clobbers() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.jpg"), b"old").unwrap();
        assert!(write_new(dir.path(), "a.jpg", |f| f.write_all(b"new")).is_err());
        assert_eq!(fs::read(dir.path().join("a.jpg")).unwrap(), b"old");
        assert_eq!(names_in(dir.path()), ["a.jpg"], "no leftover temp file");
    }

    #[test]
    fn blank_field_prints_dash() {
        let board = Board {
            id: "b".into(),
            name: "B".into(),
            reference_ids: vec![],
        };
        let mut a = reference("T");
        a.creator = Some("   ".into());
        let text = credits_text(&board, &[("1 - T.jpg".into(), &a)]);
        assert!(text.contains("Creator: \u{2014}\n"));
    }

    #[test]
    fn all_skipped_board_writes_header_only() {
        let l = lib(["Harbour", "Pier", "Gull"]);
        for r in &l.refs {
            fs::remove_file(image_path_in(&l.root, &r.file).unwrap()).unwrap();
        }
        let dest = tempfile::tempdir().unwrap();
        let rep = export_board(&l.root, &l.board, &l.refs, dest.path()).unwrap();
        assert!(rep.written.is_empty());
        assert_eq!(rep.skipped.len(), 3);
        assert_eq!(
            fs::read_to_string(dest.path().join("credits.txt")).unwrap(),
            "Horus board: Harbour\n"
        );
        assert_eq!(names_in(dest.path()), ["credits.txt"]);
    }

    #[test]
    fn report_serialises_camel_case_with_tuple_arrays() {
        let rep = ExportReport {
            written: vec!["1 - a.jpg".into()],
            credits: Some("credits.txt".into()),
            skipped: vec![("r1".into(), "missing".into())],
        };
        let v = serde_json::to_value(&rep).unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "written": ["1 - a.jpg"], "credits": "credits.txt", "skipped": [["r1", "missing"]] })
        );
    }
}
