//! Validated edits to `library.json` and `taxonomy.json`. `apply` applies an edit whole and
//! returns its inverse, or changes nothing and returns the error. Undo is applying the inverse.

use crate::model::{Board, LibraryData, Link, Reference, Tag};
use crate::taxonomy::{Branch, BranchTechnique, Domain, Operation, Taxonomy, Technique};
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// The reference fields the artist edits: Plan 2's note and source URL, and Plan 6 Task 3c's
/// title, creator, year and credit (R27, user ruling; CROSS-PLAN-AUDIT #23).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Field {
    Note,
    SourceUrl,
    Title,
    Creator,
    Year,
    Credit,
}

impl Field {
    /// Task 3c: the most characters `set_field` accepts, and the field's name in the copy.
    /// Checked where the artist types (`set_field`), not here: an imported title (a file name)
    /// can be longer, and undo must still restore it.
    pub fn cap(self) -> Option<(&'static str, usize)> {
        match self {
            Field::Title => Some(("title", 200)),
            Field::Creator => Some(("creator", 120)),
            Field::Year => Some(("year", 40)),
            Field::Credit => Some(("credit", 400)),
            Field::Note | Field::SourceUrl => None,
        }
    }
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
    /// Same id; the inverse swaps.
    UpdateTechnique {
        before: Technique,
        after: Technique,
    },
    /// Same id; the inverse swaps.
    UpdateDomain {
        before: Domain,
        after: Domain,
    },
    /// Same id; the inverse swaps.
    UpdateOperation {
        before: Operation,
        after: Operation,
    },
    AddOperation {
        op: Operation,
    },
    /// `InUse` while a branch or a tag uses it.
    RemoveOperation {
        index: usize,
        op: Operation,
    },
    AddDomain {
        domain: Domain,
    },
    /// `InUse` while a branch uses it.
    RemoveDomain {
        index: usize,
        domain: Domain,
    },
    LinkTechnique {
        link: BranchTechnique,
    },
    /// `InUse` while a tag uses the pair.
    UnlinkTechnique {
        index: usize,
        link: BranchTechnique,
    },
    AddBranch {
        branch: Branch,
    },
    /// `InUse` while a link or a tag uses it.
    RemoveBranch {
        index: usize,
        branch: Branch,
    },
    /// Plan 4: a link between two references. Appended; `why` is stored trimmed.
    AddLink {
        link: Link,
    },
    RemoveLink {
        index: usize,
        link: Link,
    },
    /// Same id and pair; only `why` may differ.
    ReplaceLink {
        before: Link,
        after: Link,
    },
    /// Appended; the name is stored trimmed.
    AddBoard {
        board: Board,
    },
    RemoveBoard {
        index: usize,
        board: Board,
    },
    /// Same id: a rename, a new `reference_ids` order, or both.
    ReplaceBoard {
        before: Board,
        after: Board,
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
    InsertOperation {
        index: usize,
        op: Operation,
        sealed: Sealed,
    },
    InsertDomain {
        index: usize,
        domain: Domain,
        sealed: Sealed,
    },
    InsertLink {
        index: usize,
        link: BranchTechnique,
        sealed: Sealed,
    },
    InsertBranch {
        index: usize,
        branch: Branch,
        sealed: Sealed,
    },
    /// `RemoveLink`'s inverse (`InsertLink` is the branch-technique one).
    InsertRefLink {
        index: usize,
        link: Link,
        sealed: Sealed,
    },
    InsertBoard {
        index: usize,
        board: Board,
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
            | Edit::InsertTechnique { .. }
            | Edit::UpdateTechnique { .. }
            | Edit::UpdateDomain { .. }
            | Edit::UpdateOperation { .. }
            | Edit::AddOperation { .. }
            | Edit::RemoveOperation { .. }
            | Edit::InsertOperation { .. }
            | Edit::AddDomain { .. }
            | Edit::RemoveDomain { .. }
            | Edit::InsertDomain { .. }
            | Edit::LinkTechnique { .. }
            | Edit::UnlinkTechnique { .. }
            | Edit::InsertLink { .. }
            | Edit::AddBranch { .. }
            | Edit::RemoveBranch { .. }
            | Edit::InsertBranch { .. } => true,
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
    pub links: bool,
    pub boards: bool,
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
    // Plan 6 D6: the artist reads this; the id stays in the value for logs.
    #[error("That tag is no longer on this reference. Nothing changed.")]
    UnknownTag(String),
    #[error("invalid tag: {0}")]
    InvalidTag(String),
    #[error("still in use: {0}")]
    InUse(String),
    #[error("duplicate id: {0}")]
    DuplicateId(String),
    // Plan 4: wire codes, which the UI matches (R2).
    #[error("SelfLink")]
    SelfLink,
    /// The id of the link that already joins the pair.
    #[error("DuplicateLink:{0}")]
    DuplicateLink(String),
    #[error("EmptyWhy")]
    EmptyWhy,
    #[error("EmptyName")]
    EmptyName,
    /// The id of the board that has the name.
    #[error("BoardNameTaken:{0}")]
    BoardNameTaken(String),
    #[error("UnknownLink:{0}")]
    UnknownLink(String),
    #[error("UnknownBoard:{0}")]
    UnknownBoard(String),
    // Plan 6 Task 3c: artist copy.
    #[error("A title can't be empty.")]
    EmptyTitle,
    #[error("That {0} is too long: {1} characters at most.")]
    TooLong(&'static str, usize),
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
            // The inverse restores what was there, whatever `before` claimed.
            let old = match field {
                // An edit never empties a title. Undo and a batch unwind (`check: false`) restore
                // what was there, even an empty title from a file name such as "   .jpg".
                Field::Title => match after.as_deref().filter(|t| !check || !t.trim().is_empty()) {
                    Some(t) => Some(std::mem::replace(&mut r.title, t.to_string())),
                    None if !check => Some(std::mem::take(&mut r.title)),
                    None => return Err(EditError::EmptyTitle),
                },
                Field::Note => std::mem::replace(&mut r.note, after.clone()),
                Field::SourceUrl => std::mem::replace(&mut r.source_url, after.clone()),
                Field::Creator => std::mem::replace(&mut r.creator, after.clone()),
                Field::Year => std::mem::replace(&mut r.year, after.clone()),
                Field::Credit => std::mem::replace(&mut r.credit, after.clone()),
            };
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
            // C31: linear history never removes a reference a link or a board still names; this
            // only keeps a bug from leaving them dangling.
            if check {
                let gone: HashSet<&str> = removed.iter().map(|(_, r)| r.id.as_str()).collect();
                let links = data.links.iter().flat_map(|l| [&l.from_ref, &l.to_ref]);
                let mut named = links.chain(data.boards.iter().flat_map(|b| &b.reference_ids));
                if let Some(id) = named.find(|id| gone.contains(id.as_str())) {
                    return Err(EditError::InUse(id.clone()));
                }
            }
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
        Edit::UpdateTechnique { before, after } => {
            update(&mut tax.techniques, &before, &after, &before.id, &after.id)?;
            touched.taxonomy = true;
            Edit::UpdateTechnique {
                before: after,
                after: before,
            }
        }
        Edit::UpdateDomain { before, after } => {
            update(&mut tax.domains, &before, &after, &before.id, &after.id)?;
            touched.taxonomy = true;
            Edit::UpdateDomain {
                before: after,
                after: before,
            }
        }
        Edit::UpdateOperation { before, after } => {
            update(&mut tax.operations, &before, &after, &before.id, &after.id)?;
            touched.taxonomy = true;
            Edit::UpdateOperation {
                before: after,
                after: before,
            }
        }
        Edit::AddOperation { op } => {
            if tax.operations.iter().any(|o| o.id == op.id) {
                return Err(EditError::DuplicateId(op.id));
            }
            let index = tax.operations.len();
            let insert = Edit::InsertOperation {
                index,
                op,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertOperation { index, op, .. } => {
            insert(&mut tax.operations, index, &op, &op.id)?;
            touched.taxonomy = true;
            Edit::RemoveOperation { index, op }
        }
        Edit::RemoveOperation { index, op } => {
            found(&tax.operations, index, &op, &op.id)?;
            let mut tags = data.references.iter().flat_map(|r| &r.tags);
            if check
                && (tax.branches.iter().any(|b| b.operation_id == op.id)
                    || tags.any(|t| t.operation_id == op.id))
            {
                return Err(EditError::InUse(op.id));
            }
            tax.operations.remove(index);
            touched.taxonomy = true;
            Edit::InsertOperation {
                index,
                op,
                sealed: Sealed(()),
            }
        }
        Edit::AddDomain { domain } => {
            if tax.domains.iter().any(|d| d.id == domain.id) {
                return Err(EditError::DuplicateId(domain.id));
            }
            let index = tax.domains.len();
            let insert = Edit::InsertDomain {
                index,
                domain,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertDomain { index, domain, .. } => {
            insert(&mut tax.domains, index, &domain, &domain.id)?;
            touched.taxonomy = true;
            Edit::RemoveDomain { index, domain }
        }
        Edit::RemoveDomain { index, domain } => {
            found(&tax.domains, index, &domain, &domain.id)?;
            if check && tax.branches.iter().any(|b| b.domain_id == domain.id) {
                return Err(EditError::InUse(domain.id));
            }
            tax.domains.remove(index);
            touched.taxonomy = true;
            Edit::InsertDomain {
                index,
                domain,
                sealed: Sealed(()),
            }
        }
        Edit::LinkTechnique { link } => {
            let at = format!("link {} -> {}", link.branch_id, link.technique_id);
            let same = |l: &BranchTechnique| {
                l.branch_id == link.branch_id && l.technique_id == link.technique_id
            };
            if tax.branch_techniques.iter().any(same) {
                return Err(EditError::DuplicateId(at));
            }
            if !tax.techniques.iter().any(|t| t.id == link.technique_id)
                || !tax.branches.iter().any(|b| b.id == link.branch_id)
            {
                return Err(EditError::InvalidTag(format!(
                    "{at}: unknown technique or branch"
                )));
            }
            let index = tax.branch_techniques.len();
            let insert = Edit::InsertLink {
                index,
                link,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertLink { index, link, .. } => {
            let at = format!("link {} -> {}", link.branch_id, link.technique_id);
            insert(&mut tax.branch_techniques, index, &link, &at)?;
            touched.taxonomy = true;
            Edit::UnlinkTechnique { index, link }
        }
        Edit::UnlinkTechnique { index, link } => {
            let at = format!("link {} -> {}", link.branch_id, link.technique_id);
            found(&tax.branch_techniques, index, &link, &at)?;
            let mut tags = data.references.iter().flat_map(|r| &r.tags);
            if check
                && tags.any(|t| {
                    t.technique_id.as_ref() == Some(&link.technique_id)
                        && t.branch_id.as_ref() == Some(&link.branch_id)
                })
            {
                return Err(EditError::InUse(at));
            }
            tax.branch_techniques.remove(index);
            touched.taxonomy = true;
            Edit::InsertLink {
                index,
                link,
                sealed: Sealed(()),
            }
        }
        Edit::AddBranch { branch } => {
            let pair = |b: &Branch| {
                b.operation_id == branch.operation_id && b.domain_id == branch.domain_id
            };
            if let Some(b) = tax.branches.iter().find(|b| b.id == branch.id || pair(b)) {
                return Err(EditError::DuplicateId(b.id.clone()));
            }
            if !tax.operations.iter().any(|o| o.id == branch.operation_id)
                || !tax.domains.iter().any(|d| d.id == branch.domain_id)
            {
                let why = format!("branch {}: unknown operation or domain", branch.id);
                return Err(EditError::InvalidTag(why));
            }
            let index = tax.branches.len();
            let insert = Edit::InsertBranch {
                index,
                branch,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertBranch { index, branch, .. } => {
            insert(&mut tax.branches, index, &branch, &branch.id)?;
            touched.taxonomy = true;
            Edit::RemoveBranch { index, branch }
        }
        Edit::RemoveBranch { index, branch } => {
            found(&tax.branches, index, &branch, &branch.id)?;
            let id = Some(&branch.id);
            let mut tags = data.references.iter().flat_map(|r| &r.tags);
            if check
                && (tax
                    .branch_techniques
                    .iter()
                    .any(|l| l.branch_id == branch.id)
                    || tags.any(|t| t.branch_id.as_ref() == id))
            {
                return Err(EditError::InUse(branch.id));
            }
            tax.branches.remove(index);
            touched.taxonomy = true;
            Edit::InsertBranch {
                index,
                branch,
                sealed: Sealed(()),
            }
        }
        Edit::AddLink { mut link } => {
            for r in [&link.from_ref, &link.to_ref] {
                ref_index(data, r)?;
            }
            if link.from_ref == link.to_ref {
                return Err(EditError::SelfLink);
            }
            link.why = link.why.trim().to_string();
            if link.why.is_empty() {
                return Err(EditError::EmptyWhy);
            }
            if data.links.iter().any(|l| l.id == link.id) {
                return Err(EditError::DuplicateId(link.id));
            }
            // Decision 2: one link per unordered pair.
            let (a, b) = (&link.from_ref, &link.to_ref);
            let pair = |l: &&Link| {
                (&l.from_ref, &l.to_ref) == (a, b) || (&l.from_ref, &l.to_ref) == (b, a)
            };
            if let Some(l) = data.links.iter().find(pair) {
                return Err(EditError::DuplicateLink(l.id.clone()));
            }
            let index = data.links.len();
            let insert = Edit::InsertRefLink {
                index,
                link,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertRefLink { index, link, .. } => {
            if index > data.links.len() {
                return Err(EditError::UnknownLink(link.id));
            }
            data.links.insert(index, link.clone());
            touched.links = true;
            Edit::RemoveLink { index, link }
        }
        Edit::RemoveLink { index, link } => {
            if data.links.get(index) != Some(&link) {
                return Err(EditError::UnknownLink(link.id));
            }
            data.links.remove(index);
            touched.links = true;
            Edit::InsertRefLink {
                index,
                link,
                sealed: Sealed(()),
            }
        }
        Edit::ReplaceLink { before, mut after } => {
            let i = data.links.iter().position(|l| l == &before);
            let i = i.ok_or_else(|| EditError::UnknownLink(before.id.clone()))?;
            let key = |l: &Link| (l.id.clone(), l.from_ref.clone(), l.to_ref.clone());
            if key(&after) != key(&before) {
                // EditError has no variant for this caller bug; like `ReplaceTag`, it is an invalid tag.
                let why = format!("link {}: a replacement changes `why` only", before.id);
                return Err(EditError::InvalidTag(why));
            }
            if check {
                after.why = after.why.trim().to_string();
                if after.why.is_empty() {
                    return Err(EditError::EmptyWhy);
                }
            }
            data.links[i] = after.clone();
            touched.links = true;
            Edit::ReplaceLink {
                before: after,
                after: before,
            }
        }
        Edit::AddBoard { mut board } => {
            board.name = board.name.trim().to_string();
            check_board(data, &board)?;
            if data.boards.iter().any(|b| b.id == board.id) {
                return Err(EditError::DuplicateId(board.id));
            }
            let index = data.boards.len();
            let insert = Edit::InsertBoard {
                index,
                board,
                sealed: Sealed(()),
            };
            return run(data, tax, insert, check);
        }
        Edit::InsertBoard { index, board, .. } => {
            if index > data.boards.len() {
                return Err(EditError::UnknownBoard(board.id));
            }
            data.boards.insert(index, board.clone());
            touched.boards = true;
            Edit::RemoveBoard { index, board }
        }
        Edit::RemoveBoard { index, board } => {
            if data.boards.get(index) != Some(&board) {
                return Err(EditError::UnknownBoard(board.id));
            }
            data.boards.remove(index);
            touched.boards = true;
            Edit::InsertBoard {
                index,
                board,
                sealed: Sealed(()),
            }
        }
        Edit::ReplaceBoard { before, mut after } => {
            let i = data.boards.iter().position(|b| b == &before);
            let i = i.ok_or_else(|| EditError::UnknownBoard(before.id.clone()))?;
            if after.id != before.id {
                let why = format!("board {}: a replacement keeps the id", before.id);
                return Err(EditError::InvalidTag(why));
            }
            if check {
                after.name = after.name.trim().to_string();
                check_board(data, &after)?;
            }
            data.boards[i] = after.clone();
            touched.boards = true;
            Edit::ReplaceBoard {
                before: after,
                after: before,
            }
        }
    };
    Ok(Applied { inverse, touched })
}

/// Puts `item` at `index`, which is at most the length. `what` names it in the error.
fn insert<T: Clone>(
    list: &mut Vec<T>,
    index: usize,
    item: &T,
    what: &str,
) -> Result<(), EditError> {
    if index > list.len() {
        return Err(EditError::UnknownTag(what.into()));
    }
    list.insert(index, item.clone());
    Ok(())
}

/// `item` is at `index` now. `what` names it in the error.
fn found<T: PartialEq>(list: &[T], index: usize, item: &T, what: &str) -> Result<(), EditError> {
    if list.get(index) != Some(item) {
        return Err(EditError::UnknownTag(what.into()));
    }
    Ok(())
}

/// Replaces the item equal to `before` (id `id`) with `after`, which keeps the id.
fn update<T: PartialEq + Clone>(
    list: &mut [T],
    before: &T,
    after: &T,
    id: &str,
    after_id: &str,
) -> Result<(), EditError> {
    let i = list.iter().position(|x| x == before);
    let i = i.ok_or_else(|| EditError::UnknownTag(id.into()))?;
    if after_id != id {
        return Err(EditError::InvalidTag(format!(
            "{id}: an update keeps the id"
        )));
    }
    list[i] = after.clone();
    Ok(())
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

/// A board's (trimmed) name is non-empty and no other board has it, ignoring case. Its
/// references exist, each once; their order is the board's.
fn check_board(data: &LibraryData, board: &Board) -> Result<(), EditError> {
    if board.name.is_empty() {
        return Err(EditError::EmptyName);
    }
    let key = board.name.to_lowercase();
    let taken = |b: &&Board| b.id != board.id && b.name.trim().to_lowercase() == key;
    if let Some(b) = data.boards.iter().find(taken) {
        return Err(EditError::BoardNameTaken(b.id.clone()));
    }
    let mut seen = HashSet::new();
    for id in &board.reference_ids {
        ref_index(data, id)?;
        if !seen.insert(id) {
            return Err(EditError::DuplicateId(id.clone()));
        }
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
    into.links |= from.links;
    into.boards |= from.boards;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Board, LibraryData, Link, Reference, Region, Tag};
    use crate::taxonomy::{BranchTechnique, Taxonomy, Technique};
    use std::path::PathBuf;

    #[test]
    fn unknown_tag_reads_as_artist_copy() {
        // Plan 6 D6: the artist sees this; no internal word or tag id.
        let s = EditError::UnknownTag("t-123".into()).to_string();
        assert_eq!(
            s,
            "That tag is no longer on this reference. Nothing changed."
        );
    }

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

    // ---------- Plan 3 Task 9: taxonomy edits ----------

    #[test]
    fn update_technique_inverse_restores() {
        let (mut data, mut tax) = fixture();
        let tax0 = tax.clone();
        let before = tax.techniques[0].clone();
        assert_eq!(before.id, "chiaroscuro");
        let after = Technique {
            name: "Light and shadow".into(),
            ..before.clone()
        };
        let applied = apply(&mut data, &mut tax, Edit::UpdateTechnique { before, after }).unwrap();
        assert!(applied.touched.taxonomy);
        assert_eq!(tax.techniques[0].name, "Light and shadow");
        assert_eq!(tax.techniques[0].id, "chiaroscuro");
        apply_inverse(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(tax, tax0);
    }

    #[test]
    fn remove_branch_in_use() {
        let (mut data, mut tax) = fixture();
        let (data0, tax0) = (data.clone(), tax.clone());
        let index = tax.branches.iter().position(|b| b.id == "group.feature");
        let index = index.unwrap();
        let branch = tax.branches[index].clone();
        let remove = Edit::RemoveBranch { index, branch };
        assert_eq!(
            apply(&mut data, &mut tax, remove),
            Err(EditError::InUse("group.feature".into()))
        );
        assert_eq!((data, tax), (data0, tax0));
    }

    /// Each new collection: append, remove, and the sealed insert put the list back.
    #[test]
    fn taxonomy_edits_round_trip() {
        let (mut data, mut tax) = fixture();
        let tax0 = tax.clone();
        let op = Operation {
            id: "pulse".into(),
            name: "Pulse".into(),
            plain_label: "Beat".into(),
            color: None,
            icon: "a plain square".into(),
            description: "".into(),
            extra: Default::default(),
        };
        let domain = Domain {
            id: "rhythm".into(),
            name: "Rhythm".into(),
            icon: "a plain square".into(),
            description: "".into(),
            extra: Default::default(),
        };
        let branch = Branch {
            id: "pulse.rhythm".into(),
            operation_id: "pulse".into(),
            domain_id: "rhythm".into(),
            extra: Default::default(),
        };
        let link = BranchTechnique {
            branch_id: "pulse.rhythm".into(),
            technique_id: "chiaroscuro".into(),
            source: "drafted".into(),
            rationale: "".into(),
            extra: Default::default(),
        };
        let batch = Edit::Batch(vec![
            Edit::AddOperation { op: op.clone() },
            Edit::AddDomain { domain },
            Edit::AddBranch { branch },
            Edit::LinkTechnique { link },
        ]);
        let undo = apply(&mut data, &mut tax, batch).unwrap().inverse;
        assert_eq!(tax.validate(), Ok(()));
        let added = tax.clone();
        let redo = apply_inverse(&mut data, &mut tax, undo).unwrap().inverse;
        assert_eq!(tax, tax0);
        apply_inverse(&mut data, &mut tax, redo).unwrap();
        assert_eq!(tax, added);
        // A duplicate id is refused; a used operation cannot go.
        let dup = apply(&mut data, &mut tax, Edit::AddOperation { op: op.clone() });
        assert_eq!(dup, Err(EditError::DuplicateId("pulse".into())));
        let index = tax.operations.len() - 1;
        let remove = Edit::RemoveOperation { index, op };
        let used = apply(&mut data, &mut tax, remove);
        assert_eq!(used, Err(EditError::InUse("pulse".into())));
        // An unused seed operation in the middle: removed, then put back in place.
        let (mut data, mut tax) = fixture();
        let index = 2;
        let op = tax.operations[index].clone();
        tax.branches.retain(|b| b.operation_id != op.id);
        tax.branch_techniques
            .retain(|l| !l.branch_id.starts_with("sequence."));
        let before = tax.clone();
        let applied = apply(&mut data, &mut tax, Edit::RemoveOperation { index, op }).unwrap();
        assert_eq!(tax.operations.len(), 3);
        apply_inverse(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(tax, before);
    }

    #[test]
    fn touches_taxonomy_covers_new_variants() {
        let tax = seed();
        let (op, domain, branch, link) = (
            tax.operations[0].clone(),
            tax.domains[0].clone(),
            tax.branches[0].clone(),
            tax.branch_techniques[0].clone(),
        );
        let t = tax.techniques[0].clone();
        let all = [
            Edit::UpdateTechnique {
                before: t.clone(),
                after: t,
            },
            Edit::UpdateDomain {
                before: domain.clone(),
                after: domain.clone(),
            },
            Edit::UpdateOperation {
                before: op.clone(),
                after: op.clone(),
            },
            Edit::AddOperation { op: op.clone() },
            Edit::RemoveOperation {
                index: 0,
                op: op.clone(),
            },
            Edit::InsertOperation {
                index: 0,
                op,
                sealed: Sealed(()),
            },
            Edit::AddDomain {
                domain: domain.clone(),
            },
            Edit::RemoveDomain {
                index: 0,
                domain: domain.clone(),
            },
            Edit::InsertDomain {
                index: 0,
                domain,
                sealed: Sealed(()),
            },
            Edit::LinkTechnique { link: link.clone() },
            Edit::UnlinkTechnique {
                index: 0,
                link: link.clone(),
            },
            Edit::InsertLink {
                index: 0,
                link,
                sealed: Sealed(()),
            },
            Edit::AddBranch {
                branch: branch.clone(),
            },
            Edit::RemoveBranch {
                index: 0,
                branch: branch.clone(),
            },
            Edit::InsertBranch {
                index: 0,
                branch,
                sealed: Sealed(()),
            },
        ];
        for e in all {
            assert!(e.touches_taxonomy(), "{e:?}");
        }
    }

    #[test]
    fn validate_rejects_mutations() {
        type Mutation = fn(&mut Taxonomy);
        let cases: [(&str, Mutation, &str); 5] = [
            (
                "dangling techniqueId",
                |t| t.branch_techniques[0].technique_id = "ghost".into(),
                "unknown techniqueId ghost",
            ),
            (
                "unknown operationId",
                |t| t.branches[0].operation_id = "ghost".into(),
                "unknown operationId ghost",
            ),
            (
                "duplicate technique id",
                |t| {
                    let copy = t.techniques[0].clone();
                    t.techniques.push(copy)
                },
                "duplicate technique id: chiaroscuro",
            ),
            (
                "technique with no link",
                |t| {
                    t.branch_techniques
                        .retain(|l| l.technique_id != "rim-light")
                },
                "rim-light: technique without a branch",
            ),
            (
                "duplicate link",
                |t| {
                    let copy = t.branch_techniques[0].clone();
                    t.branch_techniques.push(copy)
                },
                "duplicate link: differentiate.feature -> complementary-pairing",
            ),
        ];
        for (what, mutate, want) in cases {
            let mut t = seed();
            mutate(&mut t);
            let errs = t.validate().expect_err(what);
            assert!(errs.iter().any(|e| e.contains(want)), "{what}: {errs:?}");
        }
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

    // ---------- Plan 4 Task 1: links and boards ----------

    /// `fixture` plus an untagged `r3`, so three distinct pairs exist.
    fn fixture3() -> (LibraryData, Taxonomy) {
        let (mut data, tax) = fixture();
        data.references.push(reference("r3", vec![]));
        (data, tax)
    }

    fn link(id: &str, from: &str, to: &str) -> Link {
        Link {
            id: id.into(),
            from_ref: from.into(),
            to_ref: to.into(),
            why: "Same silhouette.".into(),
        }
    }

    fn board(id: &str, name: &str, refs: &[&str]) -> Board {
        Board {
            id: id.into(),
            name: name.into(),
            reference_ids: refs.iter().map(|r| r.to_string()).collect(),
        }
    }

    fn add_link(l: Link) -> Edit {
        Edit::AddLink { link: l }
    }

    fn add_board(b: Board) -> Edit {
        Edit::AddBoard { board: b }
    }

    /// Links l1 (r1-r2), l2 (r1-r3), l3 (r2-r3) and boards b1, b2, b3, added in order.
    fn with_three() -> (LibraryData, Taxonomy) {
        let (mut data, mut tax) = fixture3();
        for e in [
            add_link(link("l1", "r1", "r2")),
            add_link(link("l2", "r1", "r3")),
            add_link(link("l3", "r2", "r3")),
            add_board(board("b1", "Harbour", &["r1"])),
            add_board(board("b2", "Night", &["r2"])),
            add_board(board("b3", "Rain", &[])),
        ] {
            apply(&mut data, &mut tax, e).unwrap();
        }
        (data, tax)
    }

    #[test]
    fn link_add_inverse_restores() {
        let (mut data, mut tax) = fixture3();
        let snapshot = data.clone();
        let mut l = link("l1", "r1", "r2");
        l.why = "  Same silhouette.  ".into();
        let applied = apply(&mut data, &mut tax, add_link(l)).unwrap();
        assert!(applied.touched.links);
        assert!(!applied.touched.boards && !applied.touched.taxonomy);
        assert_eq!(
            data.links,
            [link("l1", "r1", "r2")],
            "why is stored trimmed"
        );
        let undone = apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert!(undone.touched.links);
        assert_eq!(data, snapshot);
    }

    #[test]
    fn board_add_inverse_restores() {
        let (mut data, mut tax) = fixture3();
        let snapshot = data.clone();
        let b = board("b1", "  Harbour ", &["r3", "r1"]);
        let applied = apply(&mut data, &mut tax, add_board(b)).unwrap();
        assert!(applied.touched.boards);
        assert!(!applied.touched.links && !applied.touched.taxonomy);
        let want = board("b1", "Harbour", &["r3", "r1"]);
        assert_eq!(data.boards, [want], "name trimmed, order kept");
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data, snapshot);
    }

    #[test]
    fn remove_link_inverse_restores_position() {
        let (mut data, mut tax) = with_three();
        let snapshot = data.clone();
        let l2 = data.links[1].clone();
        let remove = Edit::RemoveLink { index: 1, link: l2 };
        let applied = apply(&mut data, &mut tax, remove).unwrap();
        assert!(applied.touched.links);
        let ids: Vec<&str> = data.links.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids, ["l1", "l3"]);
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data, snapshot);
    }

    #[test]
    fn remove_board_inverse_restores_position() {
        let (mut data, mut tax) = with_three();
        let snapshot = data.clone();
        let b2 = data.boards[1].clone();
        let remove = Edit::RemoveBoard {
            index: 1,
            board: b2,
        };
        let applied = apply(&mut data, &mut tax, remove).unwrap();
        assert!(applied.touched.boards);
        let ids: Vec<&str> = data.boards.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, ["b1", "b3"]);
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data, snapshot);
    }

    #[test]
    fn self_link_refused() {
        let (mut data, mut tax) = fixture3();
        let snapshot = data.clone();
        let got = apply(&mut data, &mut tax, add_link(link("l1", "r1", "r1")));
        assert_eq!(got, Err(EditError::SelfLink));
        assert_eq!(data, snapshot);
    }

    #[test]
    fn empty_why_refused() {
        let (mut data, mut tax) = fixture3();
        let mut l = link("l1", "r1", "r2");
        l.why = "   ".into();
        let got = apply(&mut data, &mut tax, add_link(l));
        assert_eq!(got, Err(EditError::EmptyWhy));
        assert!(data.links.is_empty());
    }

    #[test]
    fn link_unknown_ref_refused() {
        let (mut data, mut tax) = fixture3();
        let got = apply(&mut data, &mut tax, add_link(link("l1", "r1", "nope")));
        assert_eq!(got, Err(EditError::UnknownReference("nope".into())));
        assert!(data.links.is_empty());
    }

    /// Decision 2: one link per unordered pair.
    #[test]
    fn duplicate_pair_refused_either_direction() {
        let (mut data, mut tax) = fixture3();
        apply(&mut data, &mut tax, add_link(link("ab", "r1", "r2"))).unwrap();
        let dup = Err(EditError::DuplicateLink("ab".into()));
        let got = apply(&mut data, &mut tax, add_link(link("ab2", "r1", "r2")));
        assert_eq!(got, dup);
        let got = apply(&mut data, &mut tax, add_link(link("ba", "r2", "r1")));
        assert_eq!(got, dup);
        let ab = data.links[0].clone();
        let remove = Edit::RemoveLink { index: 0, link: ab };
        apply(&mut data, &mut tax, remove).unwrap();
        apply(&mut data, &mut tax, add_link(link("ba", "r2", "r1"))).unwrap();
        assert_eq!(data.links.len(), 1);

        // Both directions in one batch: the second fails and the first rolls back.
        let (mut data, mut tax) = fixture3();
        let both = Edit::Batch(vec![
            add_link(link("ab", "r1", "r2")),
            add_link(link("ba", "r2", "r1")),
        ]);
        assert_eq!(apply(&mut data, &mut tax, both), dup);
        assert!(data.links.is_empty());
    }

    #[test]
    fn replace_link_changes_why_only() {
        let (mut data, mut tax) = with_three();
        let before = data.links[0].clone();
        let mut after = before.clone();
        after.why = " Both backlit. ".into();
        let replace = Edit::ReplaceLink {
            before: before.clone(),
            after,
        };
        let applied = apply(&mut data, &mut tax, replace).unwrap();
        assert!(applied.touched.links);
        assert_eq!(data.links[0].why, "Both backlit.");
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data.links[0], before);

        let snapshot = data.clone();
        let mut moved = before.clone();
        moved.to_ref = "r3".into();
        let replace = Edit::ReplaceLink {
            before,
            after: moved,
        };
        assert!(apply(&mut data, &mut tax, replace).is_err());
        assert_eq!(data, snapshot);
    }

    #[test]
    fn board_name_unique_case_insensitive() {
        let (mut data, mut tax) = with_three();
        let got = apply(
            &mut data,
            &mut tax,
            add_board(board("b4", " harbour ", &[])),
        );
        assert_eq!(got, Err(EditError::BoardNameTaken("b1".into())));
        let got = apply(&mut data, &mut tax, add_board(board("b4", "  ", &[])));
        assert_eq!(got, Err(EditError::EmptyName));
        // A rename to another board's name is taken; to its own name in another case is not.
        let b2 = data.boards[1].clone();
        let renamed = |name: &str| Edit::ReplaceBoard {
            before: b2.clone(),
            after: Board {
                name: name.into(),
                ..b2.clone()
            },
        };
        let got = apply(&mut data, &mut tax, renamed("HARBOUR"));
        assert_eq!(got, Err(EditError::BoardNameTaken("b1".into())));
        apply(&mut data, &mut tax, renamed("NIGHT")).unwrap();
        assert_eq!(data.boards[1].name, "NIGHT");
    }

    #[test]
    fn board_members_must_exist_and_be_unique() {
        let (mut data, mut tax) = fixture3();
        let got = apply(
            &mut data,
            &mut tax,
            add_board(board("b1", "A", &["r1", "nope"])),
        );
        assert_eq!(got, Err(EditError::UnknownReference("nope".into())));
        let got = apply(
            &mut data,
            &mut tax,
            add_board(board("b1", "A", &["r1", "r2", "r1"])),
        );
        assert_eq!(got, Err(EditError::DuplicateId("r1".into())));
        assert!(data.boards.is_empty());
    }

    #[test]
    fn unknown_board_refused() {
        let (mut data, mut tax) = with_three();
        let snapshot = data.clone();
        let ghost = board("ghost", "Ghost", &[]);
        let replace = Edit::ReplaceBoard {
            before: ghost.clone(),
            after: board("ghost", "Ghost 2", &[]),
        };
        let unknown = Err(EditError::UnknownBoard("ghost".into()));
        assert_eq!(apply(&mut data, &mut tax, replace), unknown);
        let remove = Edit::RemoveBoard {
            index: 0,
            board: ghost,
        };
        assert_eq!(apply(&mut data, &mut tax, remove), unknown);
        let gone = Edit::RemoveLink {
            index: 0,
            link: link("gone", "r1", "r2"),
        };
        let got = apply(&mut data, &mut tax, gone);
        assert_eq!(got, Err(EditError::UnknownLink("gone".into())));
        assert_eq!(data, snapshot);
    }

    #[test]
    fn board_reorder_is_one_edit() {
        let (mut data, mut tax) = fixture3();
        let abc = board("b1", "A", &["r1", "r2", "r3"]);
        apply(&mut data, &mut tax, add_board(abc.clone())).unwrap();
        let reversed = board("b1", "A", &["r3", "r2", "r1"]);
        let replace = Edit::ReplaceBoard {
            before: abc.clone(),
            after: reversed.clone(),
        };
        let applied = apply(&mut data, &mut tax, replace).unwrap();
        assert_eq!(data.boards[0], reversed);
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data.boards[0], abc);
    }

    /// C31: `apply` never leaves a link or a board pointing at a removed reference.
    #[test]
    fn remove_refs_in_use_guarded() {
        let (mut data, mut tax) = fixture3();
        apply(&mut data, &mut tax, add_board(board("b1", "A", &["r3"]))).unwrap();
        apply(&mut data, &mut tax, add_link(link("l1", "r1", "r2"))).unwrap();
        let snapshot = data.clone();
        let refs = data.references.clone();
        for (i, r) in refs.iter().enumerate() {
            let remove = Edit::RemoveReferences {
                removed: vec![(i, r.clone())],
            };
            let got = apply(&mut data, &mut tax, remove);
            assert_eq!(got, Err(EditError::InUse(r.id.clone())), "{}", r.id);
        }
        assert_eq!(data, snapshot);
    }

    #[test]
    fn wire_codes() {
        let id = || "x-1".to_string();
        for (e, want) in [
            (EditError::SelfLink, "SelfLink"),
            (EditError::DuplicateLink(id()), "DuplicateLink:x-1"),
            (EditError::EmptyWhy, "EmptyWhy"),
            (EditError::EmptyName, "EmptyName"),
            (EditError::BoardNameTaken(id()), "BoardNameTaken:x-1"),
            (EditError::UnknownLink(id()), "UnknownLink:x-1"),
            (EditError::UnknownBoard(id()), "UnknownBoard:x-1"),
        ] {
            assert_eq!(e.to_string(), want);
        }
    }

    #[test]
    fn merge_ors_links_and_boards() {
        let links = Touched {
            links: true,
            ..Default::default()
        };
        let boards = Touched {
            boards: true,
            ..Default::default()
        };
        let mut t = Touched::default();
        merge(&mut t, links);
        merge(&mut t, Touched::default());
        assert!(t.links && !t.boards);
        merge(&mut t, boards);
        assert!(t.links && t.boards);
    }

    // ---------- Plan 6 Task 3c: title, creator, year and credit ----------

    fn set(field: Field, after: Option<&str>) -> Edit {
        Edit::SetField {
            ref_id: "r1".into(),
            field,
            before: None,
            after: after.map(str::to_string),
        }
    }

    #[test]
    fn details_set_and_undo() {
        let (mut data, mut tax) = fixture();
        let snapshot = data.clone();
        let batch = Edit::Batch(vec![
            set(Field::Title, Some("Harbour at dusk")),
            set(Field::Creator, Some("A. Painter")),
            set(Field::Year, Some("c. 1906")),
            set(Field::Credit, Some("Private collection")),
        ]);
        let applied = apply(&mut data, &mut tax, batch).unwrap();
        let r = &data.references[0];
        assert_eq!(r.title, "Harbour at dusk");
        assert_eq!(r.creator.as_deref(), Some("A. Painter"));
        assert_eq!(r.year.as_deref(), Some("c. 1906"));
        assert_eq!(r.credit.as_deref(), Some("Private collection"));
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data, snapshot, "one inverse restores all four");
    }

    #[test]
    fn title_is_never_empty() {
        let (mut data, mut tax) = fixture();
        let snapshot = data.clone();
        for e in [set(Field::Title, None), set(Field::Title, Some(""))] {
            assert_eq!(apply(&mut data, &mut tax, e), Err(EditError::EmptyTitle));
        }
        assert_eq!(data, snapshot, "nothing changed");
        // An empty creator, year or credit clears it.
        apply(&mut data, &mut tax, set(Field::Creator, Some("x"))).unwrap();
        apply(&mut data, &mut tax, set(Field::Creator, None)).unwrap();
        assert_eq!(data.references[0].creator, None);
    }

    #[test]
    fn undo_restores_an_empty_title() {
        // AGY #2: an imported title can be empty (a file named "   .jpg"); renaming it must undo.
        let (mut data, mut tax) = fixture();
        data.references[0].title = "   ".into();
        let applied = apply(&mut data, &mut tax, set(Field::Title, Some("named"))).unwrap();
        let back = apply_inverse(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data.references[0].title, "   ");
        apply_inverse(&mut data, &mut tax, back.inverse).unwrap(); // and redo
        assert_eq!(data.references[0].title, "named");
        // A batch that fails after renaming it unwinds without a panic.
        data.references[0].title = String::new();
        let failing = Edit::Batch(vec![
            set(Field::Title, Some("named")),
            Edit::SetField {
                ref_id: "nope".into(),
                field: Field::Note,
                before: None,
                after: None,
            },
        ]);
        assert!(apply(&mut data, &mut tax, failing).is_err());
        assert_eq!(data.references[0].title, "");
    }

    #[test]
    fn undo_restores_an_over_cap_title() {
        // The caps are set_field's (what the artist types). An imported title can be longer
        // (it comes from the file name), and undo must still restore it.
        let (mut data, mut tax) = fixture();
        let long = "x".repeat(250);
        data.references[0].title = long.clone();
        let applied = apply(&mut data, &mut tax, set(Field::Title, Some("short"))).unwrap();
        apply(&mut data, &mut tax, applied.inverse).unwrap();
        assert_eq!(data.references[0].title, long);
    }

    #[test]
    fn details_copy_reads_as_copy() {
        assert_eq!(EditError::EmptyTitle.to_string(), "A title can't be empty.");
        assert_eq!(
            EditError::TooLong("credit", 400).to_string(),
            "That credit is too long: 400 characters at most."
        );
    }
}
