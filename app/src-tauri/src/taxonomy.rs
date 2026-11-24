//! Seed taxonomy: Operation -> Domain (a Branch) -> Technique, as a DAG.
//! `validate` checks structure; `validate_seed` adds the rest of `taxonomy/check_taxonomy.py`.

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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchTechnique {
    pub branch_id: String,
    pub technique_id: String,
    pub source: String,
    pub rationale: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

// Seed-pinned constants, mirrored verbatim from check_taxonomy.py; used only by `validate_seed`.
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
const OP_NAMES: [&str; 4] = ["Differentiate", "Group", "Sequence", "Infer"];
const OP_LABELS: [&str; 4] = [
    "Stand out",
    "Hold together",
    "Lead the eye",
    "Make them think",
];
const DOMAIN_NAMES: [&str; 6] = [
    "Feature", "Grouping", "Space", "Social", "Semantic", "Cultural",
];
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
const OBSERVED: [(&str, &str, &str); 4] = [
    ("Differentiate", "Feature", "Complementary pairing"),
    ("Differentiate", "Semantic", "Semantic contrast"),
    ("Infer", "Semantic", "Contextual metaphor"),
    ("Infer", "Cultural", "Genre quotation"),
];

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
}
