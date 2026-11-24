//! The demo seed: imports the bundled `resources/demo` images into a fresh library and turns
//! each manifest record's `suggestedTechniques` into suggested tags.

use crate::import;
use crate::model::{Reference, Region, Tag};
use crate::taxonomy::Taxonomy;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    id: String,
    file: String,
    title: String,
    creator: Option<String>,
    year: Option<String>,
    credit: Option<String>,
    source_url: Option<String>,
    note: Option<String>,
    #[serde(default)]
    suggested_techniques: Vec<Suggestion>,
}

#[derive(Deserialize)]
struct Suggestion {
    technique: Option<String>,
    operation: String,
    domain: Option<String>,
    region: Option<Region>,
}

/// Imports every manifest image into `root` and returns the references to append, plus
/// readable warnings. Never fails: the library already exists, so a problem here (missing
/// manifest, skipped image, unknown name) is reported, never raised.
pub fn seed(root: &Path, tax: &Taxonomy, demo_dir: &Path) -> (Vec<Reference>, Vec<String>) {
    let mut warnings = vec![];
    let records: Vec<Record> = match std::fs::read(demo_dir.join("manifest.json"))
        .map_err(|e| e.to_string())
        .and_then(|b| serde_json::from_slice(&b).map_err(|e| e.to_string()))
    {
        Ok(r) => r,
        Err(e) => {
            return (
                vec![],
                vec![format!("The demo set could not be read: {e}.")],
            );
        }
    };
    let mut known = HashMap::new();
    let mut refs = vec![];
    for rec in records {
        // One record per call, so the reference that comes back is this record's image.
        let out = import::import_paths(root, &known, &[demo_dir.join(&rec.file)]);
        let Some(mut r) = out.references.into_iter().next() else {
            warnings.push(format!("Demo image {} was not imported.", rec.id));
            continue;
        };
        known.insert(r.hash.clone(), r.id.clone());
        r.title = rec.title;
        r.creator = rec.creator;
        r.year = rec.year;
        r.credit = rec.credit;
        r.source_url = rec.source_url;
        if rec.note.is_some() {
            r.note = rec.note;
        }
        for s in &rec.suggested_techniques {
            match to_tag(tax, s) {
                Ok(mut t) => {
                    t.id = format!("{}-{}", r.id, r.tags.len() + 1);
                    r.tags.push(t);
                }
                Err(why) => warnings.push(format!("Demo {}: {why}; tag left out.", rec.id)),
            }
        }
        refs.push(r);
    }
    (refs, warnings)
}

/// Resolves display names to taxonomy ids. A partial tag (no technique) keeps the operation only.
fn to_tag(tax: &Taxonomy, s: &Suggestion) -> Result<Tag, String> {
    let op = tax
        .operations
        .iter()
        .find(|o| o.name == s.operation)
        .ok_or_else(|| format!("unknown operation \"{}\"", s.operation))?;
    let mut tag = Tag {
        id: String::new(),
        operation_id: op.id.clone(),
        technique_id: None,
        branch_id: None,
        region: s.region.clone(),
        suggested: true,
    };
    let Some(name) = &s.technique else {
        return Ok(tag);
    };
    let tech = tax
        .techniques
        .iter()
        .find(|t| &t.name == name)
        .ok_or_else(|| format!("unknown technique \"{name}\""))?;
    let domain = s.domain.as_deref().unwrap_or_default();
    let dom = tax
        .domains
        .iter()
        .find(|d| d.name == domain)
        .ok_or_else(|| format!("unknown domain \"{domain}\""))?;
    let branch = format!("{}.{}", op.id, dom.id);
    if !tax.branches.iter().any(|b| b.id == branch) {
        return Err(format!("no branch {branch}"));
    }
    tag.technique_id = Some(tech.id.clone());
    tag.branch_id = Some(branch);
    Ok(tag)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn manifest_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    }

    fn taxonomy() -> Taxonomy {
        Taxonomy::load(&manifest_dir().join("resources/taxonomy.json")).unwrap()
    }

    #[test]
    fn bundled_demo_matches_repo() {
        let read = |p: PathBuf| fs::read_to_string(p).unwrap().replace("\r\n", "\n");
        assert!(
            read(manifest_dir().join("resources/demo/manifest.json"))
                == read(manifest_dir().join("../../demo/manifest.json")),
            "resources/demo/manifest.json drifted from demo/manifest.json; copy it again"
        );
        let names = |p: PathBuf| {
            let mut v: Vec<_> = fs::read_dir(p)
                .unwrap()
                .map(|e| e.unwrap().file_name())
                .collect();
            v.sort();
            v
        };
        assert_eq!(
            names(manifest_dir().join("resources/demo/images")),
            names(manifest_dir().join("../../demo/images"))
        );
    }

    #[test]
    fn unknown_manifest_name_is_reported() {
        let demo = tempfile::tempdir().unwrap();
        fs::create_dir(demo.path().join("images")).unwrap();
        // Distinct bytes per image, or the second would dedupe against the first.
        for (name, px) in [("a", 10), ("b", 200)] {
            image::RgbImage::from_pixel(8, 6, image::Rgb([px, px, px]))
                .save(demo.path().join(format!("images/{name}.png")))
                .unwrap();
        }
        let manifest = serde_json::json!([
            {"id": "a", "file": "images/a.png", "title": "Plate A", "creator": "X", "year": "1900",
             "note": "cropped", "suggestedTechniques": [
                {"technique": "Silhouette", "operation": "Differentiate", "domain": "Feature",
                 "region": {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}, "suggested": true},
                {"technique": "Not a technique", "operation": "Infer", "domain": "Space", "suggested": true},
                {"technique": null, "operation": "Group", "domain": null, "suggested": true}
            ]},
            {"id": "b", "file": "images/b.png", "title": "Plate B", "suggestedTechniques": [
                {"technique": "Silhouette", "operation": "Stand out", "domain": "Feature", "suggested": true}
            ]},
            {"id": "gone", "file": "images/gone.png", "title": "Missing", "suggestedTechniques": []}
        ]);
        fs::write(demo.path().join("manifest.json"), manifest.to_string()).unwrap();
        let lib = tempfile::tempdir().unwrap();
        let (refs, warnings) = seed(lib.path(), &taxonomy(), demo.path());

        assert_eq!(refs.len(), 2);
        let a = &refs[0];
        assert_eq!(
            (a.title.as_str(), a.creator.as_deref(), a.note.as_deref()),
            ("Plate A", Some("X"), Some("cropped"))
        );
        let id = &a.id;
        assert_eq!(
            a.tags,
            vec![
                Tag {
                    id: format!("{id}-1"),
                    operation_id: "differentiate".into(),
                    technique_id: Some("silhouette".into()),
                    branch_id: Some("differentiate.feature".into()),
                    region: Some(Region {
                        x: 0.1,
                        y: 0.2,
                        w: 0.3,
                        h: 0.4
                    }),
                    suggested: true,
                },
                Tag {
                    id: format!("{id}-2"),
                    operation_id: "group".into(),
                    technique_id: None,
                    branch_id: None,
                    region: None,
                    suggested: true,
                },
            ]
        );
        assert!(refs[1].tags.is_empty());
        assert_eq!(warnings.len(), 3, "{warnings:?}");
        assert!(warnings[0].contains("unknown technique \"Not a technique\""));
        assert!(warnings[1].contains("unknown operation \"Stand out\""));
        assert!(warnings[2].contains("gone"));
    }
}
