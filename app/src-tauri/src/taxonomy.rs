//! Seed taxonomy: Operation -> Domain (a Branch) -> Technique, as a DAG.
//! `validate` checks structure; `validate_seed` adds the rest of `taxonomy/check_taxonomy.py`.

use crate::library::write_atomic;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Taxonomy {
    pub operations: Vec<Operation>,
    pub domains: Vec<Domain>,
    pub branches: Vec<Branch>,
    pub techniques: Vec<Technique>,
    pub branch_techniques: Vec<BranchTechnique>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub name: String,
    pub plain_label: String,
    pub color: Option<String>,
    pub icon: String,
    pub description: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Domain {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub id: String,
    pub operation_id: String,
    pub domain_id: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Technique {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub synonyms: Vec<String>,
    pub citation: Option<String>,
    pub examples: Vec<Value>,
    pub custom: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

fn null_is_empty<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Option::<String>::deserialize(d).map(Option::unwrap_or_default)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchTechnique {
    pub branch_id: String,
    pub technique_id: String,
    /// Missing and `null` both read as "" (a hand-edited file; Plan 6 C8).
    #[serde(default, deserialize_with = "null_is_empty")]
    pub source: String,
    #[serde(default, deserialize_with = "null_is_empty")]
    pub rationale: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// The only taxonomy format this build reads and writes (top-level `version`).
pub const TAXONOMY_VERSION: u64 = 1;
const NEWER: &str = "This library was saved by a newer version of Horus.";

/// Where `load_with_fallback` found the taxonomy. `SeedReadOnly` means both library files
/// were unusable: the caller must never write `taxonomy.json` (the damaged file stays
/// recoverable).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaxSource {
    File,
    Backup,
    SeedReadOnly,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CustomError {
    /// The id of the technique that already has this name.
    NameTaken(String),
    EmptyName,
    NoSuchBranch,
}

impl std::fmt::Display for CustomError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            CustomError::NameTaken(_) => "A technique with that name already exists.",
            CustomError::EmptyName => "Give the technique a name.",
            CustomError::NoSuchBranch => "That operation has no such domain.",
        })
    }
}

/// Case-folded, whitespace-collapsed: the "same name" rule (Review Focus 4).
pub(crate) fn name_key(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Lowercase alphanumeric runs joined by `-`; "technique" if nothing is left.
fn slug(name: &str) -> String {
    let lower = name.to_lowercase();
    let s = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if s.is_empty() { "technique".into() } else { s }
}

/// The slug of `name`, then `-2`, `-3` and so on, until one is not `taken`.
pub(crate) fn free_id(name: &str, taken: &HashSet<&str>) -> String {
    let base = slug(name);
    std::iter::once(base.clone())
        .chain((2..).map(|n| format!("{base}-{n}")))
        .find(|id| !taken.contains(id.as_str()))
        .expect("an unbounded sequence always finds a free id")
}

/// `Ok(None)` when the file is absent or is not a taxonomy. `Err` when an existing file can't
/// be read (a sync lock, a permission error): falling back would load an older copy, and the
/// next saves would rotate the newer file out of both copies (as `library.rs` `open` does).
/// `Err` too when it is from a newer Horus (checked before parsing, so it is never skipped).
fn read_taxonomy(path: &Path) -> Result<Option<Taxonomy>, String> {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => {
            let name = path.file_name().map_or_else(
                || path.display().to_string(),
                |n| n.to_string_lossy().into_owned(),
            );
            return Err(format!("Couldn't read {name}: {e}"));
        }
    };
    let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
        return Ok(None);
    };
    if value
        .get("version")
        .and_then(Value::as_u64)
        .is_some_and(|v| v > TAXONOMY_VERSION)
    {
        return Err(NEWER.into());
    }
    Ok(serde_json::from_value(value).ok())
}

// Seed-pinned constants, mirrored verbatim from check_taxonomy.py; used only by `validate_seed`.
// Test-only since Plan 6 Task 2: an opened taxonomy is checked with `validate()`.
#[cfg(test)]
const NAMES_41: [&str; 41] = [
    "Chiaroscuro",
    "Pop-out",
    "Saturation blocking",
    "Simultaneous contrast",
    "Warm and cool split",
    "Scale disparity",
    "Semantic contrast",
    "Common region",
    "Good continuation",
    "Symmetry",
    "Face schema",
    "Size hierarchy",
    "Temporal synthesis",
    "Leading lines",
    "Gaze cue",
    "Closure",
    "Forced perspective",
    "Caricatural exaggeration",
    "Contextual metaphor",
    "Complementary pairing",
    "Rim light",
    "Silhouette",
    "Texture against flat",
    "Isolation in void",
    "Selective focus",
    "Color blocking",
    "Figure-ground reversal",
    "Proximity clustering",
    "Anthropomorphism",
    "Semantic compounding",
    "Center placement",
    "Frame within a frame",
    "Body vector",
    "Reading path",
    "Pattern break",
    "Occlusion",
    "Crop at the edge",
    "Visual quotation",
    "Visible facture",
    "Genre quotation",
    "Form substitution",
];
#[cfg(test)]
const OP_NAMES: [&str; 4] = ["Differentiate", "Group", "Sequence", "Infer"];
#[cfg(test)]
const OP_LABELS: [&str; 4] = [
    "Stand out",
    "Hold together",
    "Lead the eye",
    "Make them think",
];
#[cfg(test)]
const DOMAIN_NAMES: [&str; 6] = [
    "Feature", "Grouping", "Space", "Social", "Semantic", "Cultural",
];
#[cfg(test)]
const ALLOWED: [(&str, &[&str]); 4] = [
    (
        "differentiate",
        &["feature", "grouping", "space", "social", "semantic"],
    ),
    ("group", &["grouping", "social", "feature"]),
    (
        "sequence",
        &["feature", "grouping", "space", "social", "cultural"],
    ),
    (
        "infer",
        &["grouping", "space", "social", "semantic", "cultural"],
    ),
];
#[cfg(test)]
const OBSERVED: [(&str, &str, &str); 4] = [
    ("Differentiate", "Feature", "Complementary pairing"),
    ("Differentiate", "Semantic", "Semantic contrast"),
    ("Infer", "Semantic", "Contextual metaphor"),
    ("Infer", "Cultural", "Genre quotation"),
];

#[cfg(test)]
fn blank(s: &str) -> bool {
    s.trim().is_empty()
}

/// Pushes one error per id that appears more than once.
fn dup_ids<'a>(kind: &str, ids: impl Iterator<Item = &'a str>, errs: &mut Vec<String>) {
    let mut seen = HashSet::new();
    for id in ids {
        if !seen.insert(id) {
            errs.push(format!("duplicate {kind} id: {id}"));
        }
    }
}

impl Taxonomy {
    pub fn load(path: &Path) -> Result<Taxonomy, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
    }

    /// Rotates `<dir>/taxonomy.bak.json` from the current file (only if it parses, so a
    /// damaged file never replaces a good backup), then writes this taxonomy atomically.
    /// An existing file that can't be read (a sync lock) is an `Err`, as in `read_taxonomy`:
    /// writing anyway would skip the rotation and replace a newer file nothing else holds.
    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let dir = path.parent().unwrap_or_else(|| Path::new("."));
        match std::fs::read(path) {
            Ok(current) if serde_json::from_slice::<Taxonomy>(&current).is_ok() => {
                write_atomic(&dir.join("taxonomy.bak.json"), &current)?;
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                let name = path.file_name().unwrap_or_default().to_string_lossy();
                return Err(std::io::Error::new(
                    e.kind(),
                    format!("Couldn't read {name}: {e}"),
                ));
            }
        }
        let bytes = serde_json::to_vec_pretty(self).map_err(std::io::Error::other)?;
        write_atomic(path, &bytes)
    }

    /// `taxonomy.json`, then `taxonomy.bak.json`, then the bundled seed (read-only). `Err`
    /// for a newer-version file, or when all three are unusable (a broken install).
    pub fn load_with_fallback(root: &Path, seed: &Path) -> Result<(Taxonomy, TaxSource), String> {
        if let Some(t) = read_taxonomy(&root.join("taxonomy.json"))? {
            return Ok((t, TaxSource::File));
        }
        if let Some(t) = read_taxonomy(&root.join("taxonomy.bak.json"))? {
            return Ok((t, TaxSource::Backup));
        }
        Taxonomy::load(seed)
            .map(|t| (t, TaxSource::SeedReadOnly))
            .map_err(|e| {
                format!(
                    "The library's technique list and its backup are damaged, and the starting \
                     list that ships with Horus could not be read ({e})."
                )
            })
    }

    /// Same name ignoring case and spacing only (Review Focus 4).
    pub fn find_by_name(&self, name: &str) -> Option<&Technique> {
        let key = name_key(name);
        self.techniques.iter().find(|t| name_key(&t.name) == key)
    }

    /// Builds (does not apply) the `AddTechnique` for an artist's new technique under the
    /// existing branch `operation_id` × `domain_id`.
    pub fn custom_technique(
        &self,
        name: &str,
        description: &str,
        operation_id: &str,
        domain_id: &str,
    ) -> Result<crate::edit::Edit, CustomError> {
        let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
        if name.is_empty() {
            return Err(CustomError::EmptyName);
        }
        if let Some(t) = self.find_by_name(&name) {
            return Err(CustomError::NameTaken(t.id.clone()));
        }
        let branch = self
            .branches
            .iter()
            .find(|b| b.operation_id == operation_id && b.domain_id == domain_id)
            .ok_or(CustomError::NoSuchBranch)?;
        // Orphan links count as taken: AddTechnique refuses an id any link already uses.
        let taken: HashSet<&str> = self
            .techniques
            .iter()
            .map(|t| t.id.as_str())
            .chain(
                self.branch_techniques
                    .iter()
                    .map(|l| l.technique_id.as_str()),
            )
            .collect();
        let id = free_id(&name, &taken);
        let technique = Technique {
            id: id.clone(),
            name,
            icon: String::new(),
            description: description.trim().to_string(),
            synonyms: vec![],
            citation: None,
            examples: vec![],
            custom: true,
            extra: Map::new(),
        };
        let link = BranchTechnique {
            branch_id: branch.id.clone(),
            technique_id: id,
            source: "drafted".into(),
            rationale: "Added by the artist in the tag picker.".into(),
            extra: Map::new(),
        };
        Ok(crate::edit::Edit::AddTechnique {
            technique,
            links: vec![link],
        })
    }

    /// Structural integrity only: unique ids, references resolve, every technique has a
    /// branch, no duplicate links. Safe for user-edited taxonomies (Task 7).
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errs = Vec::new();
        let ops: HashMap<&str, &Operation> =
            self.operations.iter().map(|o| (o.id.as_str(), o)).collect();
        let doms: HashMap<&str, &Domain> =
            self.domains.iter().map(|d| (d.id.as_str(), d)).collect();
        let brs: HashMap<&str, &Branch> =
            self.branches.iter().map(|b| (b.id.as_str(), b)).collect();
        let techs: HashMap<&str, &Technique> =
            self.techniques.iter().map(|t| (t.id.as_str(), t)).collect();
        let links = &self.branch_techniques;

        // unique ids
        dup_ids(
            "operation",
            self.operations.iter().map(|o| o.id.as_str()),
            &mut errs,
        );
        dup_ids(
            "domain",
            self.domains.iter().map(|d| d.id.as_str()),
            &mut errs,
        );
        dup_ids(
            "branch",
            self.branches.iter().map(|b| b.id.as_str()),
            &mut errs,
        );
        dup_ids(
            "technique",
            self.techniques.iter().map(|t| t.id.as_str()),
            &mut errs,
        );
        let mut pairs = HashSet::new();
        for b in &self.branches {
            if !pairs.insert((&b.operation_id, &b.domain_id)) {
                errs.push(format!(
                    "duplicate branch pair ({}, {}): {}",
                    b.operation_id, b.domain_id, b.id
                ));
            }
        }
        let mut seen_links = HashSet::new();
        for l in links {
            if !seen_links.insert((&l.branch_id, &l.technique_id)) {
                errs.push(format!(
                    "duplicate link: {} -> {}",
                    l.branch_id, l.technique_id
                ));
            }
        }

        // references resolve
        for b in &self.branches {
            if !ops.contains_key(b.operation_id.as_str()) {
                errs.push(format!("{}: unknown operationId {}", b.id, b.operation_id));
            }
            if !doms.contains_key(b.domain_id.as_str()) {
                errs.push(format!("{}: unknown domainId {}", b.id, b.domain_id));
            }
        }
        for l in links {
            let at = format!("link {} -> {}", l.branch_id, l.technique_id);
            if !brs.contains_key(l.branch_id.as_str()) {
                errs.push(format!("{at}: unknown branchId {}", l.branch_id));
            }
            if !techs.contains_key(l.technique_id.as_str()) {
                errs.push(format!("{at}: unknown techniqueId {}", l.technique_id));
            }
        }

        // coverage
        let parented: HashSet<&str> = links.iter().map(|l| l.technique_id.as_str()).collect();
        for t in &self.techniques {
            if !parented.contains(t.id.as_str()) {
                errs.push(format!("{}: technique without a branch", t.id));
            }
        }
        if errs.is_empty() { Ok(()) } else { Err(errs) }
    }

    /// `validate` plus the seed-pinned rules of `taxonomy/check_taxonomy.py`. Only for the
    /// shipped seed; a user's taxonomy may legitimately break these.
    #[cfg(test)]
    pub fn validate_seed(&self) -> Result<(), Vec<String>> {
        let mut errs = self.validate().err().unwrap_or_default();
        let ops: HashMap<&str, &Operation> =
            self.operations.iter().map(|o| (o.id.as_str(), o)).collect();
        let doms: HashMap<&str, &Domain> =
            self.domains.iter().map(|d| (d.id.as_str(), d)).collect();
        let brs: HashMap<&str, &Branch> =
            self.branches.iter().map(|b| (b.id.as_str(), b)).collect();
        let techs: HashMap<&str, &Technique> =
            self.techniques.iter().map(|t| (t.id.as_str(), t)).collect();
        let links = &self.branch_techniques;

        // names
        let op_names: Vec<&str> = self.operations.iter().map(|o| o.name.as_str()).collect();
        if op_names != OP_NAMES {
            errs.push(format!(
                "operation names must be {OP_NAMES:?}, got {op_names:?}"
            ));
        }
        let op_labels: Vec<&str> = self
            .operations
            .iter()
            .map(|o| o.plain_label.as_str())
            .collect();
        if op_labels != OP_LABELS {
            errs.push(format!(
                "operation plainLabels must be {OP_LABELS:?}, got {op_labels:?}"
            ));
        }
        let dom_names: HashSet<&str> = self.domains.iter().map(|d| d.name.as_str()).collect();
        if dom_names != HashSet::from(DOMAIN_NAMES) {
            errs.push(format!(
                "domain names must be {DOMAIN_NAMES:?}, got {dom_names:?}"
            ));
        }
        let mut seed_names: Vec<&str> = Vec::new();
        for t in &self.techniques {
            let reel = NAMES_41.contains(&t.name.as_str());
            if !t.custom {
                seed_names.push(&t.name);
                if !reel {
                    errs.push(format!(
                        "{}: seed technique name {:?} is not a reel name",
                        t.id, t.name
                    ));
                }
            } else if reel {
                errs.push(format!(
                    "{}: custom technique reuses reel name {:?}",
                    t.id, t.name
                ));
            }
        }
        for name in NAMES_41 {
            match seed_names.iter().filter(|n| **n == name).count() {
                1 => {}
                0 => errs.push(format!("missing seed technique: {name}")),
                n => errs.push(format!("seed technique {name} appears {n} times")),
            }
        }
        let mut lower = HashSet::new();
        for t in &self.techniques {
            if !lower.insert(t.name.to_lowercase()) {
                errs.push(format!("{}: duplicate technique name {:?}", t.id, t.name));
            }
        }

        // branches allowed
        for b in &self.branches {
            let allowed = ALLOWED.iter().find(|(op, _)| *op == b.operation_id);
            if !allowed.is_some_and(|(_, d)| d.contains(&b.domain_id.as_str())) {
                errs.push(format!("{}: domain not allowed: {}", b.id, b.domain_id));
            }
        }
        for l in links {
            let at = format!("link {} -> {}", l.branch_id, l.technique_id);
            if l.source != "observed" && l.source != "drafted" {
                errs.push(format!(
                    "{at}: source must be observed or drafted, got {:?}",
                    l.source
                ));
            }
            if blank(&l.rationale) {
                errs.push(format!("{at}: empty rationale"));
            }
        }

        // coverage
        let used: HashSet<&str> = links.iter().map(|l| l.branch_id.as_str()).collect();
        for b in &self.branches {
            if !used.contains(b.id.as_str()) {
                errs.push(format!("{}: empty branch", b.id));
            }
        }
        // Seed policy only: the seed keeps domain prompts at zero (one branch per operation
        // per technique). `validate` allows more, and the tag picker asks (SPEC §6.3).
        let mut op_tech: HashMap<(&str, &str), usize> = HashMap::new();
        for l in links {
            if let Some(b) = brs.get(l.branch_id.as_str()) {
                *op_tech
                    .entry((&b.operation_id, &l.technique_id))
                    .or_default() += 1;
            }
        }
        let mut multi: Vec<_> = op_tech.into_iter().filter(|(_, n)| *n > 1).collect();
        multi.sort();
        for ((op, tech), n) in multi {
            errs.push(format!("{tech}: under {n} branches of operation {op}"));
        }

        // observed paths: exactly these four
        let observed: Vec<&BranchTechnique> =
            links.iter().filter(|l| l.source == "observed").collect();
        let mut paths = HashSet::new();
        for l in &observed {
            let b = brs.get(l.branch_id.as_str());
            let path = b.and_then(|b| {
                Some((
                    ops.get(b.operation_id.as_str())?.name.as_str(),
                    doms.get(b.domain_id.as_str())?.name.as_str(),
                    techs.get(l.technique_id.as_str())?.name.as_str(),
                ))
            });
            match path {
                Some(p) if OBSERVED.contains(&p) => {
                    paths.insert(p);
                }
                _ => errs.push(format!(
                    "link {} -> {}: not one of the observed paths",
                    l.branch_id, l.technique_id
                )),
            }
        }
        for p in OBSERVED {
            if !paths.contains(&p) {
                errs.push(format!("missing observed path {} / {} / {}", p.0, p.1, p.2));
            }
        }
        if observed.len() != OBSERVED.len() {
            errs.push(format!("expected 4 observed links, got {}", observed.len()));
        }

        // field shape (custom is a bool by type)
        for t in &self.techniques {
            if !t.examples.is_empty() {
                errs.push(format!("{}: examples must be empty", t.id));
            }
            if blank(&t.description) || blank(&t.icon) {
                errs.push(format!("{}: empty description or icon", t.id));
            }
            if t.synonyms.is_empty() || t.synonyms.iter().any(|s| blank(s)) {
                errs.push(format!("{}: synonyms must be non-empty strings", t.id));
            }
            if t.citation.as_deref().is_some_and(blank) {
                errs.push(format!("{}: citation must be null or non-empty", t.id));
            }
        }
        let shapes = self
            .operations
            .iter()
            .map(|o| (&o.id, &o.icon, &o.description));
        let shapes = shapes.chain(
            self.domains
                .iter()
                .map(|d| (&d.id, &d.icon, &d.description)),
        );
        for (id, icon, description) in shapes {
            if blank(icon) || blank(description) {
                errs.push(format!("{id}: empty icon or description"));
            }
        }
        for o in &self.operations {
            if o.color.is_some() {
                errs.push(format!("{}: color must be null", o.id));
            }
        }

        if errs.is_empty() { Ok(()) } else { Err(errs) }
    }

    /// Every branch of `operation_id` that holds `technique_id`. More than one means the
    /// tag picker must ask which domain (SPEC §6.3).
    pub fn branches_for(&self, operation_id: &str, technique_id: &str) -> Vec<&Branch> {
        self.branches
            .iter()
            .filter(|b| {
                b.operation_id == operation_id
                    && self
                        .branch_techniques
                        .iter()
                        .any(|l| l.branch_id == b.id && l.technique_id == technique_id)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn seed_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/taxonomy.json")
    }

    fn seed() -> Taxonomy {
        Taxonomy::load(&seed_path()).expect("seed loads")
    }

    #[test]
    fn seed_validates() {
        let t = seed();
        assert_eq!(t.validate_seed(), Ok(()));
        assert_eq!(t.techniques.len(), 48);
        assert_eq!(t.branches.len(), 18);
        assert_eq!(t.branch_techniques.len(), 55);
        assert!(
            t.branch_techniques
                .iter()
                .any(|l| l.branch_id == "differentiate.feature"
                    && l.technique_id == "complementary-pairing")
        );
    }

    #[test]
    fn validate_catches_dangling() {
        let mut t = seed();
        let mut link = t.branch_techniques[0].clone();
        link.branch_id = "nope.missing".into();
        t.branch_techniques.push(link);
        let errs = t.validate().unwrap_err();
        assert!(errs.iter().any(|e| e.contains("nope.missing")), "{errs:?}");
    }

    #[test]
    fn validate_rejects_each_broken_rule() {
        // Plan 6 C8: one mutation per rule, each named in the errors (table-driven).
        type Mutation = fn(&mut Taxonomy);
        let cases: [(&str, Mutation); 10] = [
            ("duplicate operation", |t| {
                t.operations.push(t.operations[0].clone())
            }),
            ("duplicate domain", |t| t.domains.push(t.domains[0].clone())),
            ("duplicate branch", |t| {
                let mut b = t.branches[0].clone();
                b.domain_id = t.domains[1].id.clone(); // a new pair, so only the id repeats
                t.branches.push(b);
            }),
            ("duplicate technique", |t| {
                t.techniques.push(t.techniques[0].clone())
            }),
            ("duplicate branch pair", |t| {
                let mut b = t.branches[0].clone();
                b.id = "pair.copy".into();
                t.branches.push(b);
            }),
            ("duplicate link", |t| {
                t.branch_techniques.push(t.branch_techniques[0].clone())
            }),
            ("unknown operationId", |t| {
                t.branches[0].operation_id = "gone".into()
            }),
            ("unknown domainId", |t| {
                t.branches[0].domain_id = "gone".into()
            }),
            ("unknown techniqueId", |t| {
                t.branch_techniques[0].technique_id = "gone".into()
            }),
            ("technique without a branch", |t| {
                let id = t.techniques[0].id.clone();
                t.branch_techniques.retain(|l| l.technique_id != id);
            }),
        ];
        for (want, mutate) in cases {
            let mut t = seed();
            mutate(&mut t);
            let errs = t.validate().expect_err(want);
            assert!(errs.iter().any(|e| e.contains(want)), "{want}: {errs:?}");
        }
    }

    #[test]
    fn a_link_missing_source_or_rationale_loads_as_empty() {
        // Plan 6 C8: a missing optional key and an empty one read the same.
        for json in [
            r#"{"branchId": "b", "techniqueId": "t"}"#,
            r#"{"branchId": "b", "techniqueId": "t", "source": null, "rationale": null}"#,
        ] {
            let l: BranchTechnique = serde_json::from_str(json).unwrap();
            assert_eq!(
                (l.source.as_str(), l.rationale.as_str()),
                ("", ""),
                "{json}"
            );
        }
    }

    #[test]
    fn roundtrip_preserves_fields() {
        let text = std::fs::read_to_string(seed_path()).unwrap();
        let mut original: Value = serde_json::from_str(&text).unwrap();
        // Inject an unknown key at the top level and into one item of every array.
        original["futureKey"] = Value::from("top");
        for key in [
            "operations",
            "domains",
            "branches",
            "techniques",
            "branchTechniques",
        ] {
            original[key][0]["futureKey"] = Value::from(key);
        }
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("taxonomy.json");
        std::fs::write(&path, serde_json::to_string(&original).unwrap()).unwrap();
        let loaded = Taxonomy::load(&path).expect("loads");
        let back: Value = serde_json::from_str(&serde_json::to_string(&loaded).unwrap()).unwrap();
        assert_eq!(back, original);
        // Spot-check the fields the brief names.
        assert!(back["operations"][0].get("color").is_some());
        assert!(back["techniques"][0].get("examples").is_some());
        assert_eq!(back["version"], Value::from(1));
    }

    #[test]
    fn branches_for_dag() {
        let mut t = seed();
        assert!(!t.branches_for("differentiate", "chiaroscuro").is_empty());
        // The seed has no technique under two branches of one operation, so build one.
        // SPEC §6.3 allows it: the structural validator must accept it.
        assert!(t.branches.iter().any(|b| b.id == "differentiate.space"));
        let mut link = t.branch_techniques[0].clone();
        link.branch_id = "differentiate.space".into();
        link.technique_id = "chiaroscuro".into();
        link.source = "drafted".into();
        t.branch_techniques.push(link);
        assert_eq!(t.validate(), Ok(()));
        let mut ids: Vec<&str> = t
            .branches_for("differentiate", "chiaroscuro")
            .iter()
            .map(|b| b.id.as_str())
            .collect();
        ids.sort();
        assert_eq!(ids, ["differentiate.feature", "differentiate.space"]);
    }

    #[test]
    fn validate_is_structural_only() {
        // User edits that break seed-pinned rules must still pass `validate`.
        let mut t = seed();
        t.operations[0].color = Some("#ff0000".into());
        t.operations[0].name = "Stand apart".into();
        t.techniques[0].name = "Renamed".into();
        t.techniques[0].examples.push(Value::from("img-1"));
        assert_eq!(t.validate(), Ok(()));
        assert!(t.validate_seed().is_err());
    }

    #[test]
    fn bundled_seed_matches_repo() {
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../taxonomy/taxonomy.json");
        let read = |p: &Path| std::fs::read_to_string(p).unwrap().replace("\r\n", "\n");
        assert!(
            read(&seed_path()) == read(&repo),
            "resources/taxonomy.json drifted from taxonomy/taxonomy.json; copy it again"
        );
    }

    fn empty_data() -> crate::model::LibraryData {
        crate::model::LibraryData {
            version: 1,
            references: vec![],
            links: vec![],
            boards: vec![],
        }
    }

    /// `seed` with "Halo glow" added through `custom_technique` + `edit::apply`.
    fn seed_with_halo() -> Taxonomy {
        let mut t = seed();
        let e = t
            .custom_technique(
                "Halo glow",
                "A soft ring of light around the subject.",
                "differentiate",
                "feature",
            )
            .unwrap();
        crate::edit::apply(&mut empty_data(), &mut t, e).unwrap();
        t
    }

    fn tmp_names(dir: &Path) -> Vec<String> {
        std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".tmp") || n.starts_with(".tmp"))
            .collect()
    }

    #[test]
    fn save_writes_no_key_absent_from_the_seed() {
        let seed_value: Value =
            serde_json::from_str(&std::fs::read_to_string(seed_path()).unwrap()).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("taxonomy.json");
        seed().save(&path).unwrap();
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved, seed_value);
        // And the save/load round trip keeps unknown keys too (extends roundtrip_preserves_fields).
        let mut with_extra = seed_value.clone();
        with_extra["techniques"][0]["futureKey"] = Value::from("kept");
        std::fs::write(&path, serde_json::to_string(&with_extra).unwrap()).unwrap();
        Taxonomy::load(&path).unwrap().save(&path).unwrap();
        let back: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(back, with_extra);
    }

    #[test]
    fn custom_technique_is_custom_and_linked() {
        let t = seed();
        let e = t
            .custom_technique(
                "Halo glow",
                "A soft ring of light around the subject.",
                "differentiate",
                "feature",
            )
            .unwrap();
        let crate::edit::Edit::AddTechnique { technique, links } = &e else {
            panic!("expected AddTechnique, got {e:?}");
        };
        assert!(technique.custom);
        assert_eq!(technique.id, "halo-glow");
        assert_eq!(technique.name, "Halo glow");
        assert_eq!(technique.icon, "");
        assert!(technique.synonyms.is_empty() && technique.examples.is_empty());
        assert_eq!(technique.citation, None);
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].branch_id, "differentiate.feature");
        assert_eq!(links[0].technique_id, "halo-glow");
        assert_eq!(links[0].source, "drafted");
        assert_eq!(links[0].rationale, "Added by the artist in the tag picker.");
        let t = seed_with_halo();
        assert_eq!(t.validate(), Ok(()));
        assert!(t.techniques.iter().any(|x| x.id == "halo-glow"));
    }

    #[test]
    fn custom_name_collision() {
        let t = seed();
        for name in ["  chiaroscuro ", "CHIAROSCURO"] {
            assert_eq!(
                t.custom_technique(name, "", "differentiate", "feature"),
                Err(CustomError::NameTaken("chiaroscuro".into())),
                "{name:?}"
            );
        }
        assert_eq!(
            t.custom_technique("   ", "", "differentiate", "feature"),
            Err(CustomError::EmptyName)
        );
    }

    #[test]
    fn custom_unknown_branch() {
        assert_eq!(
            seed().custom_technique("x", "", "group", "semantic"),
            Err(CustomError::NoSuchBranch)
        );
    }

    #[test]
    fn custom_id_suffix() {
        let t = seed_with_halo();
        // Only case and spacing differ: the same name (Review Focus 4, ruling B6).
        assert_eq!(
            t.custom_technique("HALO  Glow", "", "differentiate", "feature"),
            Err(CustomError::NameTaken("halo-glow".into()))
        );
        // Punctuation makes it a different name that slugifies to the same id.
        let e = t
            .custom_technique("Halo-Glow!", "", "differentiate", "feature")
            .unwrap();
        let crate::edit::Edit::AddTechnique { technique, links } = e else {
            panic!()
        };
        assert_eq!(technique.id, "halo-glow-2");
        assert_eq!(links[0].technique_id, "halo-glow-2");
    }

    #[test]
    fn find_by_name_ignores_case_and_spacing_only() {
        let t = seed();
        assert_eq!(
            t.find_by_name("  rim   LIGHT ").map(|x| x.id.as_str()),
            Some("rim-light")
        );
        assert!(t.find_by_name("rim-light").is_none());
    }

    #[test]
    fn taxonomy_backup_rotates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("taxonomy.json");
        let bak = dir.path().join("taxonomy.bak.json");
        let first = seed();
        first.save(&path).unwrap();
        assert!(
            !bak.exists(),
            "no backup before there is a previous version"
        );
        let first_bytes = std::fs::read(&path).unwrap();
        let second = seed_with_halo();
        second.save(&path).unwrap();
        assert_eq!(std::fs::read(&bak).unwrap(), first_bytes);
        assert_eq!(Taxonomy::load(&path).unwrap(), second);
        assert!(
            tmp_names(dir.path()).is_empty(),
            "{:?}",
            tmp_names(dir.path())
        );
        // A save over an unparseable taxonomy.json leaves the good backup alone.
        std::fs::write(&path, "{").unwrap();
        second.save(&path).unwrap();
        assert_eq!(std::fs::read(&bak).unwrap(), first_bytes);
        assert_eq!(Taxonomy::load(&path).unwrap(), second);
    }

    #[test]
    fn damaged_taxonomy_falls_back() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::copy(seed_path(), root.join("taxonomy.bak.json")).unwrap();
        std::fs::write(root.join("taxonomy.json"), "{").unwrap();
        let (t, src) = Taxonomy::load_with_fallback(root, &seed_path()).unwrap();
        assert_eq!((t, src), (seed(), TaxSource::Backup));

        std::fs::write(root.join("taxonomy.bak.json"), "not json").unwrap();
        let (t, src) = Taxonomy::load_with_fallback(root, &seed_path()).unwrap();
        assert_eq!((t, src), (seed(), TaxSource::SeedReadOnly));

        let missing_seed = root.join("no-such-seed.json");
        assert!(Taxonomy::load_with_fallback(root, &missing_seed).is_err());

        // A good file is used as is.
        seed_with_halo().save(&root.join("taxonomy.json")).unwrap();
        let (t, src) = Taxonomy::load_with_fallback(root, &seed_path()).unwrap();
        assert_eq!(src, TaxSource::File);
        assert!(t.techniques.iter().any(|x| x.id == "halo-glow"));
    }

    #[test]
    fn unreadable_taxonomy_refuses_instead_of_using_backup() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // A directory at the file's path: the read fails with a non-NotFound error, as a
        // sync lock or permission error would. The older backup must not be used.
        std::fs::create_dir(root.join("taxonomy.json")).unwrap();
        std::fs::copy(seed_path(), root.join("taxonomy.bak.json")).unwrap();
        let err = Taxonomy::load_with_fallback(root, &seed_path()).unwrap_err();
        assert!(err.starts_with("Couldn't read taxonomy.json:"), "{err}");
        // The same rule for the backup: unreadable is an error, not a reason to use the seed.
        std::fs::remove_dir(root.join("taxonomy.json")).unwrap();
        std::fs::remove_file(root.join("taxonomy.bak.json")).unwrap();
        std::fs::create_dir(root.join("taxonomy.bak.json")).unwrap();
        let err = Taxonomy::load_with_fallback(root, &seed_path()).unwrap_err();
        assert!(err.starts_with("Couldn't read taxonomy.bak.json:"), "{err}");
    }

    #[test]
    fn newer_taxonomy_refused() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut v: Value =
            serde_json::from_str(&std::fs::read_to_string(seed_path()).unwrap()).unwrap();
        v["version"] = Value::from(2);
        let bytes = serde_json::to_vec(&v).unwrap();
        std::fs::write(root.join("taxonomy.json"), &bytes).unwrap();
        std::fs::copy(seed_path(), root.join("taxonomy.bak.json")).unwrap();
        let err = Taxonomy::load_with_fallback(root, &seed_path()).unwrap_err();
        assert_eq!(err, "This library was saved by a newer version of Horus.");
        assert_eq!(std::fs::read(root.join("taxonomy.json")).unwrap(), bytes);
        // A newer backup is refused too, rather than skipped.
        std::fs::write(root.join("taxonomy.json"), "{").unwrap();
        std::fs::write(root.join("taxonomy.bak.json"), &bytes).unwrap();
        assert!(Taxonomy::load_with_fallback(root, &seed_path()).is_err());
    }

    #[test]
    fn branch_technique_source_and_rationale_default() {
        let link: BranchTechnique =
            serde_json::from_str(r#"{"branchId":"a.b","techniqueId":"t"}"#).unwrap();
        assert_eq!((link.source.as_str(), link.rationale.as_str()), ("", ""));
    }

    #[test]
    fn save_refuses_unreadable_current() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("taxonomy.json");
        // A directory at the file's path: the read fails with a non-NotFound error, as a
        // sync lock would. Writing anyway would rotate nothing and lose the newer file.
        std::fs::create_dir(&path).unwrap();
        let tax = Taxonomy::load(&seed_path()).unwrap();
        let err = tax.save(&path).unwrap_err().to_string();
        assert!(err.starts_with("Couldn't read taxonomy.json:"), "{err}");
        assert!(!dir.path().join("taxonomy.bak.json").exists());
    }

    #[test]
    fn rotation_skips_valid_json_of_the_wrong_shape() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("taxonomy.json");
        let bak = dir.path().join("taxonomy.bak.json");
        let good = std::fs::read(seed_path()).unwrap();
        std::fs::write(&bak, &good).unwrap();
        let tax = Taxonomy::load(&seed_path()).unwrap();
        for wrong in ["{}", "[]"] {
            std::fs::write(&path, wrong).unwrap();
            tax.save(&path).unwrap();
            assert_eq!(
                std::fs::read(&bak).unwrap(),
                good,
                "{wrong} replaced the backup"
            );
        }
    }

    #[test]
    fn custom_id_skips_orphan_link() {
        let mut t = Taxonomy::load(&seed_path()).unwrap();
        t.branch_techniques.push(BranchTechnique {
            branch_id: "differentiate.feature".into(),
            technique_id: "halo-glow".into(),
            source: "drafted".into(),
            rationale: String::new(),
            extra: Map::new(),
        });
        let crate::edit::Edit::AddTechnique { technique, .. } = t
            .custom_technique("Halo glow", "", "differentiate", "feature")
            .unwrap()
        else {
            panic!()
        };
        assert_eq!(technique.id, "halo-glow-2");
    }

    #[test]
    fn save_failure_keeps_old_taxonomy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("taxonomy.json");
        std::fs::copy(seed_path(), &path).unwrap();
        let before = std::fs::read(&path).unwrap();
        std::fs::create_dir(dir.path().join("taxonomy.json.tmp")).unwrap();
        let mut tax = Taxonomy::load(&seed_path()).unwrap();
        tax.techniques[0].name = "Renamed".into();
        assert!(tax.save(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }
}
