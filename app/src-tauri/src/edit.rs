//! Validated edits to `library.json` and `taxonomy.json`. `apply` applies an edit whole and
//! returns its inverse, or changes nothing and returns the error. Undo is applying the inverse.

use crate::model::{LibraryData, Reference, Tag};
use crate::taxonomy::{BranchTechnique, Taxonomy, Technique};
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// The reference fields Plan 2 edits. No title/creator/year/credit (CROSS-PLAN-AUDIT #23).
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Field {
    Note,
    SourceUrl,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Edit {
    /// Appended in order.
    AddTags {
        ref_id: String,
        tags: Vec<Tag>,
    },
    /// Original positions, ascending.
    RemoveTags {
        ref_id: String,
        removed: Vec<(usize, Tag)>,
    },
    /// Same id.
    ReplaceTag {
        ref_id: String,
        before: Tag,
        after: Tag,
    },
    SetField {
        ref_id: String,
        field: Field,
        before: Option<String>,
        after: Option<String>,
    },
    AddReferences {
        refs: Vec<Reference>,
    },
    RemoveReferences {
        removed: Vec<(usize, Reference)>,
    },
    AddTechnique {
        technique: Technique,
        links: Vec<BranchTechnique>,
    },
    RemoveTechnique {
        index: usize,
        technique: Technique,
        links: Vec<BranchTechnique>,
    },
    Batch(Vec<Edit>),
    // The inverses of the removes: they put items back at their original positions, which the
    // appending `Add*` variants cannot. They restore a state that existed, so they check
    // positions only; the `Add*` variants do the validating. `Sealed` keeps code outside this
    // module from building one: it can only pass along an inverse `apply` returned.
    /// Final positions, ascending.
    InsertTags {
        ref_id: String,
        tags: Vec<(usize, Tag)>,
        sealed: Sealed,
    },
    /// Final positions, ascending.
    InsertReferences {
        refs: Vec<(usize, Reference)>,
        sealed: Sealed,
    },
    /// `links` carry their final positions in `branch_techniques`, ascending.
    InsertTechnique {
        index: usize,
        technique: Technique,
        links: Vec<(usize, BranchTechnique)>,
        sealed: Sealed,
    },
}

/// Only `edit.rs` can construct this, so only it can build an `Insert*` edit.
///
/// ```compile_fail
/// let _ = horus_lib::edit::Sealed(());
/// ```
#[derive(Clone, Debug, PartialEq)]
pub struct Sealed(());

impl Edit {
    pub fn touches_taxonomy(&self) -> bool {
        match self {
            Edit::AddTechnique { .. }
            | Edit::RemoveTechnique { .. }
            | Edit::InsertTechnique { .. } => true,
            Edit::Batch(parts) => parts.iter().any(Edit::touches_taxonomy),
            _ => false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Touched {
    pub ref_ids: Vec<String>,
    pub removed_ref_ids: Vec<String>,
    pub taxonomy: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Applied {
    pub inverse: Edit,
    pub touched: Touched,
}

#[derive(Clone, Debug, PartialEq, thiserror::Error)]
pub enum EditError {
    #[error("unknown reference: {0}")]
    UnknownReference(String),
    #[error("unknown tag: {0}")]
    UnknownTag(String),
    #[error("invalid tag: {0}")]
    InvalidTag(String),
    #[error("still in use: {0}")]
    InUse(String),
    #[error("duplicate id: {0}")]
    DuplicateId(String),
}

/// SPEC §3: a partial tag carries the operation only. A technique tag sets technique and
/// branch together, and the branch belongs to the tag's operation and holds the technique.
pub fn validate_tag(tax: &Taxonomy, t: &Tag) -> Result<(), EditError> {
    let invalid = |why: &str| Err(EditError::InvalidTag(format!("{}: {why}", t.id)));
    if !tax.operations.iter().any(|o| o.id == t.operation_id) {
        return invalid("unknown operation");
    }
    match (&t.technique_id, &t.branch_id) {
        (None, None) => {}
        (Some(tech), Some(branch)) => {
            let branches = tax.branches_for(&t.operation_id, tech);
            if !branches.iter().any(|b| &b.id == branch) {
                return invalid("the branch does not hold the technique under this operation");
            }
        }
        _ => return invalid("technique and branch must be set together"),
    }
    if let Some(r) = &t.region {
        // ponytail: 1e-6 absorbs f32 rounding in x + w. Written positively, so NaN fails.
        let ok = r.x >= 0.0
            && r.y >= 0.0
            && r.w > 0.0
            && r.h > 0.0
            && r.x + r.w <= 1.0 + 1e-6
            && r.y + r.h <= 1.0 + 1e-6;
        if !ok {
            return invalid("the region must lie inside the image");
        }
    }
    Ok(())
}

/// `<prefix>-<base36 unix nanos>-<base36 counter>`. The counter keeps ids unique within the
/// process when the clock repeats.
pub fn new_id(prefix: &str) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{}-{}", base36(nanos), base36(n.into()))
}

fn base36(mut n: u128) -> String {
    let mut out = vec![];
    loop {
        out.push(b"0123456789abcdefghijklmnopqrstuvwxyz"[(n % 36) as usize]);
        n /= 36;
        if n == 0 {
            break;
        }
    }
    out.reverse();
    String::from_utf8(out).expect("ascii")
}

/// Applies `e` atomically: on `Err`, `data` and `tax` are unchanged.
pub fn apply(data: &mut LibraryData, tax: &mut Taxonomy, e: Edit) -> Result<Applied, EditError> {
    run(data, tax, e, true)
}

/// Undo and redo: applies an inverse (or the inverse of one) with `check: false`, because it
/// restores a state that existed, stale tags included.
pub(crate) fn apply_inverse(
    data: &mut LibraryData,
    tax: &mut Taxonomy,
    edit: Edit,
) -> Result<Applied, EditError> {
    run(data, tax, edit, false)
}

/// `check: false` skips tag validation and the `InUse` scan. A batch unwinds with it, because
/// an inverse restores a state that existed, and the unwind must not fail on a stale tag.
fn run(
    data: &mut LibraryData,
    tax: &mut Taxonomy,
    e: Edit,
    check: bool,
) -> Result<Applied, EditError> {
    let mut touched = Touched::default();
    let inverse = match e {
        Edit::Batch(parts) => {
            let mut inverses = vec![];
            for part in parts {
                match run(data, tax, part, check) {
                    Ok(a) => {
                        merge(&mut touched, a.touched);
                        inverses.push(a.inverse);
                    }
                    Err(err) => {
                        for inv in inverses.into_iter().rev() {
                            run(data, tax, inv, false).expect("an inverse applies");
                        }
                        return Err(err);
                    }
                }
            }
            inverses.reverse();
            Edit::Batch(inverses)
        }
        Edit::AddTags { ref_id, tags } => {
            let r = &data.references[ref_index(data, &ref_id)?];
            check_new_tags(tax, &r.tags, &tags)?;
            let len = r.tags.len();
            let tags = tags.into_iter().enumerate();
            let tags = tags.map(|(i, t)| (len + i, t)).collect();
            let insert = Edit::InsertTags {
                ref_id,
                tags,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertTags { ref_id, tags, .. } => {
            let i = ref_index(data, &ref_id)?;
            let r = &mut data.references[i];
            check_insert(r.tags.len(), &tags).map_err(|t| EditError::UnknownTag(t.id.clone()))?;
            for (i, t) in tags.iter().cloned() {
                r.tags.insert(i, t);
            }
            touched.ref_ids.push(ref_id.clone());
            Edit::RemoveTags {
                ref_id,
                removed: tags,
            }
        }
        Edit::RemoveTags { ref_id, removed } => {
            let i = ref_index(data, &ref_id)?;
            let r = &mut data.references[i];
            check_remove(&r.tags, &removed).map_err(|t| EditError::UnknownTag(t.id.clone()))?;
            for (i, _) in removed.iter().rev() {
                r.tags.remove(*i);
            }
            touched.ref_ids.push(ref_id.clone());
            Edit::InsertTags {
                ref_id,
                tags: removed,
                sealed: Sealed(()),
            }
        }
        Edit::ReplaceTag {
            ref_id,
            before,
            after,
        } => {
            let r = ref_index(data, &ref_id)?;
            let i = data.references[r].tags.iter().position(|t| t == &before);
            let i = i.ok_or_else(|| EditError::UnknownTag(before.id.clone()))?;
            if after.id != before.id {
                let why = format!("{}: a replacement keeps the id", before.id);
                return Err(EditError::InvalidTag(why));
            }
            if check {
                validate_tag(tax, &after)?;
            }
            data.references[r].tags[i] = after.clone();
            touched.ref_ids.push(ref_id.clone());
            Edit::ReplaceTag {
                ref_id,
                before: after,
                after: before,
            }
        }
        Edit::SetField {
            ref_id,
            field,
            after,
            ..
        } => {
            let i = ref_index(data, &ref_id)?;
            let r = &mut data.references[i];
            let slot = match field {
                Field::Note => &mut r.note,
                Field::SourceUrl => &mut r.source_url,
            };
            // The inverse restores what was there, whatever `before` claimed.
            let old = std::mem::replace(slot, after.clone());
            touched.ref_ids.push(ref_id.clone());
            Edit::SetField {
                ref_id,
                field,
                before: after,
                after: old,
            }
        }
        Edit::AddReferences { refs } => {
            let mut ids: HashSet<&str> = data.references.iter().map(|r| r.id.as_str()).collect();
            for r in &refs {
                if !ids.insert(&r.id) {
                    return Err(EditError::DuplicateId(r.id.clone()));
                }
                check_new_tags(tax, &[], &r.tags)?;
            }
            let len = data.references.len();
            let refs = refs.into_iter().enumerate();
            let refs = refs.map(|(i, r)| (len + i, r)).collect();
            let insert = Edit::InsertReferences {
                refs,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertReferences { refs, .. } => {
            check_insert(data.references.len(), &refs)
                .map_err(|r| EditError::UnknownReference(r.id.clone()))?;
            for (i, r) in refs.iter().cloned() {
                data.references.insert(i, r);
            }
            touched.ref_ids = refs.iter().map(|(_, r)| r.id.clone()).collect();
            Edit::RemoveReferences { removed: refs }
        }
        Edit::RemoveReferences { removed } => {
            check_remove(&data.references, &removed)
                .map_err(|r| EditError::UnknownReference(r.id.clone()))?;
            for (i, _) in removed.iter().rev() {
                data.references.remove(*i);
            }
            touched.removed_ref_ids = removed.iter().map(|(_, r)| r.id.clone()).collect();
            Edit::InsertReferences {
                refs: removed,
                sealed: Sealed(()),
            }
        }
        Edit::AddTechnique { technique, links } => {
            let id = &technique.id;
            // An orphan link (one taxonomy.json may hold) also claims the id; letting it in would
            // give the inverse more links than it expects.
            if tax.techniques.iter().any(|t| &t.id == id)
                || tax.branch_techniques.iter().any(|l| &l.technique_id == id)
            {
                return Err(EditError::DuplicateId(id.clone()));
            }
            // EditError has no technique variant; a bad link is reported as an invalid tag.
            let invalid = |why: String| EditError::InvalidTag(format!("technique {id}: {why}"));
            if links.is_empty() {
                return Err(invalid("needs a branch".into()));
            }
            let mut branches = HashSet::new();
            for l in &links {
                if &l.technique_id != id
                    || !tax.branches.iter().any(|b| b.id == l.branch_id)
                    || !branches.insert(&l.branch_id)
                {
                    return Err(invalid(format!("bad link to {}", l.branch_id)));
                }
            }
            let (index, len) = (tax.techniques.len(), tax.branch_techniques.len());
            let links = links.into_iter().enumerate();
            let links = links.map(|(i, l)| (len + i, l)).collect();
            let insert = Edit::InsertTechnique {
                index,
                technique,
                links,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertTechnique {
            index,
            technique,
            links,
            ..
        } => {
            let bad = || EditError::UnknownTag(format!("technique {}", technique.id));
            if index > tax.techniques.len() {
                return Err(bad());
            }
            check_insert(tax.branch_techniques.len(), &links).map_err(|_| bad())?;
            tax.techniques.insert(index, technique.clone());
            for (i, l) in links.iter().cloned() {
                tax.branch_techniques.insert(i, l);
            }
            touched.taxonomy = true;
            Edit::RemoveTechnique {
                index,
                technique,
                links: links.into_iter().map(|(_, l)| l).collect(),
            }
        }
        Edit::RemoveTechnique {
            index,
            technique,
            links,
        } => {
            let id = &technique.id;
            // EditError has no technique variant; a missing technique is an unknown tag.
            let unknown = |why: &str| EditError::UnknownTag(format!("technique {id}{why}"));
            if tax.techniques.get(index) != Some(&technique) {
                return Err(unknown(""));
            }
            let actual: Vec<(usize, BranchTechnique)> = tax
                .branch_techniques
                .iter()
                .enumerate()
                .filter(|(_, l)| &l.technique_id == id)
                .map(|(i, l)| (i, l.clone()))
                .collect();
            if !actual.iter().map(|(_, l)| l).eq(&links) {
                return Err(unknown(": the links differ"));
            }
            let mut tags = data.references.iter().flat_map(|r| &r.tags);
            if check && tags.any(|t| t.technique_id.as_ref() == Some(id)) {
                return Err(EditError::InUse(id.clone()));
            }
            tax.techniques.remove(index);
            for (i, _) in actual.iter().rev() {
                tax.branch_techniques.remove(*i);
            }
            touched.taxonomy = true;
            Edit::InsertTechnique {
                index,
                technique,
                links: actual,
                sealed: Sealed(()),
            }
        }
    };
    Ok(Applied { inverse, touched })
}

fn ref_index(data: &LibraryData, id: &str) -> Result<usize, EditError> {
    let i = data.references.iter().position(|r| r.id == id);
    i.ok_or_else(|| EditError::UnknownReference(id.into()))
}

/// Each new tag is valid, and its id is new to the reference and to the list.
fn check_new_tags(tax: &Taxonomy, existing: &[Tag], new: &[Tag]) -> Result<(), EditError> {
    let mut ids: HashSet<&str> = existing.iter().map(|t| t.id.as_str()).collect();
    for t in new {
        validate_tag(tax, t)?;
        if !ids.insert(&t.id) {
            return Err(EditError::DuplicateId(t.id.clone()));
        }
    }
    Ok(())
}

/// Final positions, strictly ascending, inserted in order into a list of `len`: the k-th is at
/// most `len + k`. Returns the first item at a bad position.
fn check_insert<T>(len: usize, items: &[(usize, T)]) -> Result<(), &T> {
    let mut prev = None;
    for (k, (i, item)) in items.iter().enumerate() {
        if *i > len + k || prev.is_some_and(|p| *i <= p) {
            return Err(item);
        }
        prev = Some(*i);
    }
    Ok(())
}

/// Each `(i, item)` is at `i` now, with `i` strictly ascending. Returns the first mismatch.
fn check_remove<'a, T: PartialEq>(list: &[T], removed: &'a [(usize, T)]) -> Result<(), &'a T> {
    let mut prev = None;
    for (i, item) in removed {
        if list.get(*i) != Some(item) || prev.is_some_and(|p| *i <= p) {
            return Err(item);
        }
        prev = Some(*i);
    }
    Ok(())
}

/// Batch parts add up, and an id is listed once.
fn merge(into: &mut Touched, from: Touched) {
    for (to, ids) in [
        (&mut into.ref_ids, from.ref_ids),
        (&mut into.removed_ref_ids, from.removed_ref_ids),
    ] {
        for id in ids {
            if !to.contains(&id) {
                to.push(id);
            }
        }
    }
    into.taxonomy |= from.taxonomy;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{LibraryData, Reference, Region, Tag};
    use crate::taxonomy::{BranchTechnique, Taxonomy, Technique};
    use std::path::PathBuf;

    fn seed() -> Taxonomy {
        Taxonomy::load(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/taxonomy.json"))
            .expect("seed loads")
    }

    fn reference(id: &str, tags: Vec<Tag>) -> Reference {
        Reference {
            id: id.into(),
            title: id.into(),
            creator: None,
            year: None,
            source_url: None,
            credit: None,
            note: None,
            file: format!("images/{id}.jpg"),
            hash: id.into(),
            width: 10,
            height: 10,
            added_at: "2026-11-25T00:00:00Z".into(),
            tags,
        }
    }

    fn partial(id: &str, op: &str) -> Tag {
        Tag {
            id: id.into(),
            operation_id: op.into(),
            technique_id: None,
            branch_id: None,
            region: None,
            suggested: false,
        }
    }

    fn technique_tag(id: &str, op: &str, tech: &str, branch: &str) -> Tag {
        Tag {
            technique_id: Some(tech.into()),
            branch_id: Some(branch.into()),
            ..partial(id, op)
        }
    }

    /// Two references: `r1` untagged (in the Inbox), `r2` with three tags.
    fn fixture() -> (LibraryData, Taxonomy) {
        let data = LibraryData {
            version: 1,
            references: vec![
                reference("r1", vec![]),
                reference(
                    "r2",
                    vec![
                        partial("t1", "infer"),
                        technique_tag("t2", "differentiate", "pop-out", "differentiate.feature"),
                        partial("t3", "group"),
                    ],
                ),
            ],
            links: vec![],
            boards: vec![],
        };
        (data, seed())
    }

    fn custom_technique(id: &str) -> (Technique, Vec<BranchTechnique>) {
        let technique = Technique {
            id: id.into(),
            name: "My trick".into(),
            icon: "sparkle".into(),
            description: "Custom.".into(),
            synonyms: vec![],
            citation: None,
            examples: vec![],
            custom: true,
            extra: Default::default(),
        };
        let link = BranchTechnique {
            branch_id: "differentiate.feature".into(),
            technique_id: id.into(),
            source: "drafted".into(),
            rationale: "Mine.".into(),
            extra: Default::default(),
        };
        (technique, vec![link])
    }

    #[test]
    fn add_then_inverse_restores() {
        let (mut data, mut tax) = fixture();
        let snapshot = data.clone();
        let applied = apply(
            &mut data,
            &mut tax,
            Edit::AddTags {
                ref_id: "r1".into(),
                tags: vec![partial("n1", "infer"), partial("n2", "group")],
            },
        )
        .unwrap();
        assert_eq!(applied.touched.ref_ids, ["r1"]);
        assert!(!applied.touched.taxonomy);
        let ids: Vec<&str> = data.references[0]
            .tags
            .iter()
            .map(|t| t.id.as_str())
            .collect();
        assert_eq!(ids, ["n1", "n2"]);
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data, snapshot);
    }

    #[test]
    fn remove_inverse_restores_positions() {
        let (mut data, mut tax) = fixture();
        let snapshot = data.clone();
        let t2 = data.references[1].tags[1].clone();
        let applied = apply(
            &mut data,
            &mut tax,
            Edit::RemoveTags {
                ref_id: "r2".into(),
                removed: vec![(1, t2)],
            },
        )
        .unwrap();
        let ids: Vec<&str> = data.references[1]
            .tags
            .iter()
            .map(|t| t.id.as_str())
            .collect();
        assert_eq!(ids, ["t1", "t3"]);
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data, snapshot);

        // References: remove index 0 of 2, restore it, then redo and undo again.
        let r1 = data.references[0].clone();
        let applied = apply(
            &mut data,
            &mut tax,
            Edit::RemoveReferences {
                removed: vec![(0, r1)],
            },
        )
        .unwrap();
        assert_eq!(applied.touched.removed_ref_ids, ["r1"]);
        let redo = apply(&mut data, &mut tax, applied.inverse).unwrap().inverse;
        assert_eq!(data, snapshot);
        let undo = apply(&mut data, &mut tax, redo).unwrap().inverse;
        assert_eq!(data.references.len(), 1);
        apply(&mut data, &mut tax, undo).unwrap();
        assert_eq!(data, snapshot);

        // Techniques: a seed technique that is not last, with no link at the tail.
        let tax0 = tax.clone();
        let last = tax.branch_techniques.len() - 1;
        let links_of = |id: &str| -> Vec<(usize, BranchTechnique)> {
            let all = tax.branch_techniques.iter().cloned().enumerate();
            all.filter(|(_, l)| l.technique_id == id).collect()
        };
        let index = (0..tax.techniques.len() - 1)
            .find(|&i| {
                let t = &tax.techniques[i];
                t.id != "pop-out" && links_of(&t.id).iter().all(|(p, _)| *p < last)
            })
            .expect("a technique in the middle");
        let technique = tax.techniques[index].clone();
        let links = links_of(&technique.id)
            .into_iter()
            .map(|(_, l)| l)
            .collect();
        let remove = Edit::RemoveTechnique {
            index,
            technique,
            links,
        };
        let applied = apply(&mut data, &mut tax, remove.clone()).unwrap();
        assert!(applied.touched.taxonomy);
        let redo = apply(&mut data, &mut tax, applied.inverse).unwrap().inverse;
        assert_eq!(tax, tax0);
        assert_eq!(redo, remove);
        let undo = apply(&mut data, &mut tax, redo).unwrap().inverse;
        apply(&mut data, &mut tax, undo).unwrap();
        assert_eq!(tax, tax0);
    }

    #[test]
    fn technique_tag_needs_matching_branch() {
        let (_, tax) = fixture();
        let invalid = |t: Tag| {
            assert!(
                matches!(validate_tag(&tax, &t), Err(EditError::InvalidTag(_))),
                "{t:?}"
            )
        };
        invalid(Tag {
            technique_id: Some("pop-out".into()),
            ..partial("a", "differentiate")
        });
        invalid(Tag {
            branch_id: Some("differentiate.feature".into()),
            ..partial("b", "differentiate")
        });
        invalid(technique_tag(
            "c",
            "sequence",
            "pop-out",
            "sequence.feature",
        ));
        invalid(technique_tag(
            "d",
            "group",
            "pop-out",
            "differentiate.feature",
        ));
        assert_eq!(
            validate_tag(
                &tax,
                &technique_tag("e", "differentiate", "pop-out", "differentiate.feature")
            ),
            Ok(())
        );
    }

    #[test]
    fn partial_tag_is_valid() {
        let (_, tax) = fixture();
        assert_eq!(validate_tag(&tax, &partial("p", "infer")), Ok(()));
    }

    #[test]
    fn region_bounds() {
        let (_, tax) = fixture();
        let with = |x, y, w, h| Tag {
            region: Some(Region { x, y, w, h }),
            ..partial("r", "infer")
        };
        for bad in [
            with(0.1, 0.1, 0.0, 0.5),
            with(0.5, 0.1, 0.6, 0.5),
            with(0.1, -0.1, 0.5, 0.5),
            with(f32::NAN, 0.1, 0.5, 0.5),
        ] {
            assert!(
                matches!(validate_tag(&tax, &bad), Err(EditError::InvalidTag(_))),
                "{bad:?}"
            );
        }
        assert_eq!(validate_tag(&tax, &with(0.0, 0.0, 1.0, 1.0)), Ok(()));
    }

    #[test]
    fn unknown_ref_is_error_and_data_unchanged() {
        let (mut data, mut tax) = fixture();
        let snapshot = data.clone();
        let edits = [
            Edit::AddTags {
                ref_id: "nope".into(),
                tags: vec![partial("n1", "infer")],
            },
            Edit::SetField {
                ref_id: "nope".into(),
                field: Field::Note,
                before: None,
                after: Some("x".into()),
            },
        ];
        for e in edits {
            assert_eq!(
                apply(&mut data, &mut tax, e),
                Err(EditError::UnknownReference("nope".into()))
            );
        }
        assert_eq!(data, snapshot);
    }

    #[test]
    fn batch_failure_rolls_back() {
        let (mut data, mut tax) = fixture();
        let snapshot = data.clone();
        let mut parts = vec![
            Edit::AddTags {
                ref_id: "r1".into(),
                tags: vec![partial("n1", "infer")],
            },
            Edit::SetField {
                ref_id: "r1".into(),
                field: Field::Note,
                before: None,
                after: Some("a note".into()),
            },
            Edit::ReplaceTag {
                ref_id: "r2".into(),
                before: partial("t1", "infer"),
                after: partial("t1", "sequence"),
            },
        ];
        // The good parts apply on their own.
        let applied = apply(&mut data, &mut tax, Edit::Batch(parts.clone())).unwrap();
        assert_eq!(data.references[0].note.as_deref(), Some("a note"));
        assert_eq!(data.references[1].tags[0].operation_id, "sequence");
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data, snapshot);

        parts.push(Edit::AddTags {
            ref_id: "nope".into(),
            tags: vec![partial("n2", "infer")],
        });
        let result = apply(&mut data, &mut tax, Edit::Batch(parts));
        assert_eq!(result, Err(EditError::UnknownReference("nope".into())));
        assert_eq!(data, snapshot);
    }

    #[test]
    fn batch_inverse_reverses() {
        let (mut data, mut tax) = fixture();
        let (data0, tax0) = (data.clone(), tax.clone());
        let (technique, links) = custom_technique("my-trick");
        let batch = Edit::Batch(vec![
            Edit::AddTechnique { technique, links },
            Edit::AddTags {
                ref_id: "r1".into(),
                tags: vec![technique_tag(
                    "n1",
                    "differentiate",
                    "my-trick",
                    "differentiate.feature",
                )],
            },
        ]);
        assert!(batch.touches_taxonomy());
        let lone = Edit::AddTags {
            ref_id: "r1".into(),
            tags: vec![],
        };
        assert!(!lone.touches_taxonomy());

        let applied = apply(&mut data, &mut tax, batch).unwrap();
        assert!(applied.touched.taxonomy);
        assert_eq!(applied.touched.ref_ids, ["r1"]);
        assert_eq!(tax.validate(), Ok(()));
        assert!(applied.inverse.touches_taxonomy());
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data, data0);
        assert_eq!(tax, tax0);
    }

    #[test]
    fn remove_technique_in_use_fails() {
        let (mut data, mut tax) = fixture();
        let (technique, links) = custom_technique("my-trick");
        apply(
            &mut data,
            &mut tax,
            Edit::AddTechnique {
                technique: technique.clone(),
                links: links.clone(),
            },
        )
        .unwrap();
        apply(
            &mut data,
            &mut tax,
            Edit::AddTags {
                ref_id: "r1".into(),
                tags: vec![technique_tag(
                    "n1",
                    "differentiate",
                    "my-trick",
                    "differentiate.feature",
                )],
            },
        )
        .unwrap();
        let (data0, tax0) = (data.clone(), tax.clone());
        let index = tax.techniques.len() - 1;
        let result = apply(
            &mut data,
            &mut tax,
            Edit::RemoveTechnique {
                index,
                technique,
                links,
            },
        );
        assert_eq!(result, Err(EditError::InUse("my-trick".into())));
        assert_eq!((data, tax), (data0, tax0));
    }

    #[test]
    fn duplicate_tag_id_rejected() {
        let (mut data, mut tax) = fixture();
        let snapshot = data.clone();
        for tags in [
            vec![partial("t1", "infer")],
            vec![partial("n1", "infer"), partial("n1", "group")],
        ] {
            let result = apply(
                &mut data,
                &mut tax,
                Edit::AddTags {
                    ref_id: "r2".into(),
                    tags,
                },
            );
            assert!(
                matches!(result, Err(EditError::DuplicateId(_))),
                "{result:?}"
            );
        }
        assert_eq!(data, snapshot);
    }

    #[test]
    fn new_id_unique() {
        let ids: std::collections::HashSet<String> = (0..10_000).map(|_| new_id("tag")).collect();
        assert_eq!(ids.len(), 10_000);
        let base36 = |s: &str| {
            !s.is_empty()
                && s.chars()
                    .all(|c| c.is_ascii_digit() || c.is_ascii_lowercase())
        };
        for id in &ids {
            let parts: Vec<&str> = id.split('-').collect();
            assert_eq!(parts.len(), 3, "{id}");
            assert_eq!(parts[0], "tag");
            assert!(base36(parts[1]) && base36(parts[2]), "{id}");
        }
    }

    // Fix round 1: undo and unwinds restore states that existed, even stale ones.

    /// An edit that always fails, to force a batch to unwind.
    fn failing() -> Edit {
        Edit::AddTags {
            ref_id: "nope".into(),
            tags: vec![],
        }
    }

    /// `r2.t2` names a technique the taxonomy does not have (SeedReadOnly keeps such ids).
    fn with_stale_tag() -> (LibraryData, Taxonomy, Tag) {
        let (mut data, tax) = fixture();
        let stale = technique_tag("t2", "differentiate", "gone", "differentiate.feature");
        data.references[1].tags[1] = stale.clone();
        (data, tax, stale)
    }

    #[test]
    fn undo_replace_of_stale_tag() {
        let (mut data, mut tax, stale) = with_stale_tag();
        let snapshot = data.clone();
        let replace = Edit::ReplaceTag {
            ref_id: "r2".into(),
            before: stale,
            after: partial("t2", "infer"),
        };
        let inverse = apply(&mut data, &mut tax, replace.clone()).unwrap().inverse;
        assert!(matches!(
            apply(&mut data.clone(), &mut tax.clone(), inverse.clone()),
            Err(EditError::InvalidTag(_))
        ));
        let redo = apply_inverse(&mut data, &mut tax, inverse).unwrap().inverse;
        assert_eq!(data, snapshot);
        apply_inverse(&mut data, &mut tax, redo).unwrap();
        assert_eq!(data.references[1].tags[1], partial("t2", "infer"));

        // The batch unwind takes the same path.
        let mut data = snapshot.clone();
        let result = apply(&mut data, &mut tax, Edit::Batch(vec![replace, failing()]));
        assert_eq!(result, Err(EditError::UnknownReference("nope".into())));
        assert_eq!(data, snapshot);
    }

    #[test]
    fn undo_add_technique_with_orphan_tags() {
        let (mut data, mut tax) = fixture();
        // An orphan tag already names the id the new technique takes.
        data.references[0].tags.push(technique_tag(
            "o1",
            "differentiate",
            "my-trick",
            "differentiate.feature",
        ));
        let (data0, tax0) = (data.clone(), tax.clone());
        let (technique, links) = custom_technique("my-trick");
        let add = Edit::AddTechnique { technique, links };
        let inverse = apply(&mut data, &mut tax, add.clone()).unwrap().inverse;
        assert!(matches!(
            apply(&mut data.clone(), &mut tax.clone(), inverse.clone()),
            Err(EditError::InUse(_))
        ));
        apply_inverse(&mut data, &mut tax, inverse).unwrap();
        assert_eq!((&data, &tax), (&data0, &tax0));

        let result = apply(&mut data, &mut tax, Edit::Batch(vec![add, failing()]));
        assert_eq!(result, Err(EditError::UnknownReference("nope".into())));
        assert_eq!((data, tax), (data0, tax0));
    }

    #[test]
    fn orphan_link_blocks_add_technique() {
        let (mut data, mut tax) = fixture();
        let (technique, links) = custom_technique("my-trick");
        // taxonomy.json may hold a link to a technique it lacks; open only warns.
        tax.branch_techniques.push(links[0].clone());
        let (data0, tax0) = (data.clone(), tax.clone());
        let add = Edit::AddTechnique { technique, links };
        let dup = Err(EditError::DuplicateId("my-trick".into()));
        assert_eq!(apply(&mut data, &mut tax, add.clone()), dup);
        assert_eq!(
            apply(&mut data, &mut tax, Edit::Batch(vec![add, failing()])),
            dup
        );
        assert_eq!((data, tax), (data0, tax0));
    }
}
