//! Plan 3 Task 9: the taxonomy-edit commands, moved out of `commands.rs` (Plan 4 Task 0).

use super::*;

// Every command below goes through `commit` and is one undo step. Error names (C22) are plain
// strings: NeedsMove, LastLink, LastOperation, TooManyOperations, UnknownInk, UnknownIcon,
// EmptyName, BadMoveTarget, NameTaken:<id> and LabelTaken:<id>.

/// A multi-part taxonomy change, built on a scratch copy so that each recorded index matches
/// the state at its step. Additions and tag moves apply as they are pushed. Removals wait for
/// `finish`, which emits them by collection (links, techniques, branches, domains,
/// operations), each in descending index order, so the reversed inverse re-inserts ascending.
struct TaxPlan {
    data: LibraryData,
    tax: Taxonomy,
    parts: Vec<Edit>,
    /// `(branch_id, technique_id)`.
    links: Vec<(String, String)>,
    techniques: Vec<String>,
    branches: Vec<String>,
    domains: Vec<String>,
    operations: Vec<String>,
    /// Stale tags a re-key turned partial (`Change.made_partial`).
    made_partial: usize,
}

impl TaxPlan {
    fn new(data: &LibraryData, tax: &Taxonomy) -> TaxPlan {
        TaxPlan {
            data: data.clone(),
            tax: tax.clone(),
            parts: vec![],
            links: vec![],
            techniques: vec![],
            branches: vec![],
            domains: vec![],
            operations: vec![],
            made_partial: 0,
        }
    }

    fn push(&mut self, e: Edit) -> Result<(), String> {
        edit::apply(&mut self.data, &mut self.tax, e.clone()).map_err(|e| e.to_string())?;
        self.parts.push(e);
        Ok(())
    }

    /// Every tag `hit` picks, with its reference id. Hidden references count too.
    fn tags(&self, hit: impl Fn(&Tag) -> bool) -> Vec<(String, Tag)> {
        let refs = self.data.references.iter();
        let all = refs.flat_map(|r| r.tags.iter().map(move |t| (r.id.clone(), t.clone())));
        all.filter(|(_, t)| hit(t)).collect()
    }

    fn replace(&mut self, (ref_id, before): (String, Tag), after: Tag) -> Result<(), String> {
        self.push(Edit::ReplaceTag {
            ref_id,
            before,
            after,
        })
    }

    fn finish(mut self) -> Result<Edit, String> {
        let links = std::mem::take(&mut self.links);
        let hit = |l: &BranchTechnique| {
            links
                .iter()
                .any(|(b, t)| *b == l.branch_id && *t == l.technique_id)
        };
        for index in descending(&self.tax.branch_techniques, hit) {
            let link = self.tax.branch_techniques[index].clone();
            self.push(Edit::UnlinkTechnique { index, link })?;
        }
        let ids = std::mem::take(&mut self.techniques);
        for index in descending(&self.tax.techniques, |t| ids.contains(&t.id)) {
            let technique = self.tax.techniques[index].clone();
            let links = self.tax.branch_techniques.iter();
            let links = links.filter(|l| l.technique_id == technique.id).cloned();
            let links = links.collect();
            self.push(Edit::RemoveTechnique {
                index,
                technique,
                links,
            })?;
        }
        let ids = std::mem::take(&mut self.branches);
        for index in descending(&self.tax.branches, |b| ids.contains(&b.id)) {
            let branch = self.tax.branches[index].clone();
            self.push(Edit::RemoveBranch { index, branch })?;
        }
        let ids = std::mem::take(&mut self.domains);
        for index in descending(&self.tax.domains, |d| ids.contains(&d.id)) {
            let domain = self.tax.domains[index].clone();
            self.push(Edit::RemoveDomain { index, domain })?;
        }
        let ids = std::mem::take(&mut self.operations);
        for index in descending(&self.tax.operations, |o| ids.contains(&o.id)) {
            let op = self.tax.operations[index].clone();
            self.push(Edit::RemoveOperation { index, op })?;
        }
        Ok(Edit::Batch(self.parts))
    }
}

fn descending<T>(list: &[T], hit: impl Fn(&T) -> bool) -> Vec<usize> {
    (0..list.len()).rev().filter(|&i| hit(&list[i])).collect()
}

/// Moves branch `from` onto the branch `(to_op, to_domain)`, minting `<to_op>.<to_domain>` if
/// no branch has that pair (C16): its missing links, then its tags (which take `to_op`), then
/// `from`'s links and `from` itself are queued for removal. Every operation or domain move.
/// A tag that would not be valid on `to` (a dangling technique or branch, R16) becomes a
/// partial tag under `to_op` instead, so stale data never refuses the move (I1); its region
/// goes too if it is out of bounds. Undo restores each tag's `before`.
fn rekey_branch(p: &mut TaxPlan, from: &str, to_op: &str, to_domain: &str) -> Result<(), String> {
    let pair = |b: &&Branch| b.operation_id == to_op && b.domain_id == to_domain;
    let to = match p.tax.branches.iter().find(pair) {
        Some(b) => b.id.clone(),
        None => {
            let id = format!("{to_op}.{to_domain}");
            p.push(Edit::AddBranch {
                branch: Branch {
                    id: id.clone(),
                    operation_id: to_op.into(),
                    domain_id: to_domain.into(),
                    extra: Default::default(),
                },
            })?;
            id
        }
    };
    let links = p.tax.branch_techniques.iter();
    let links: Vec<BranchTechnique> = links.filter(|l| l.branch_id == from).cloned().collect();
    for l in &links {
        let present = |x: &BranchTechnique| x.branch_id == to && x.technique_id == l.technique_id;
        if !p.tax.branch_techniques.iter().any(present) {
            let link = BranchTechnique {
                branch_id: to.clone(),
                ..l.clone()
            };
            p.push(Edit::LinkTechnique { link })?;
        }
    }
    for tagged in p.tags(|t| t.branch_id.as_deref() == Some(from)) {
        let mut after = Tag {
            operation_id: to_op.into(),
            branch_id: Some(to.clone()),
            ..tagged.1.clone()
        };
        if edit::validate_tag(&p.tax, &after).is_err() {
            p.made_partial += 1;
            after.technique_id = None;
            after.branch_id = None;
            if edit::validate_tag(&p.tax, &after).is_err() {
                after.region = None;
            }
        }
        p.replace(tagged, after)?;
    }
    let pairs = links.into_iter().map(|l| (l.branch_id, l.technique_id));
    p.links.extend(pairs);
    p.branches.push(from.into());
    Ok(())
}

/// Queues `branches` for removal: a link whose technique is linked elsewhere is unlinked, and a
/// technique linked only here is removed (its `RemoveTechnique` takes the links, C15).
fn drop_branches(p: &mut TaxPlan, branches: &[String]) {
    for l in &p.tax.branch_techniques {
        if !branches.contains(&l.branch_id) {
            continue;
        }
        let elsewhere = |x: &BranchTechnique| {
            x.technique_id == l.technique_id && !branches.contains(&x.branch_id)
        };
        if p.tax.branch_techniques.iter().any(elsewhere) {
            p.links.push((l.branch_id.clone(), l.technique_id.clone()));
        } else if !p.techniques.contains(&l.technique_id) {
            p.techniques.push(l.technique_id.clone());
        }
    }
    p.branches.extend_from_slice(branches);
}

/// `Err("NeedsMove")` when the item is `used` and no move was given; `None` when unused.
fn needs_move<M>(used: bool, move_to: Option<M>) -> Result<Option<M>, String> {
    match (used, move_to) {
        (false, _) => Ok(None),
        (true, None) => Err("NeedsMove".into()),
        (true, m) => Ok(m),
    }
}

/// Re-points `affected` for `to` (C9). A technique target must be a linked pair that `gone`
/// does not reject; the tag takes that branch's operation and is confirmed.
fn move_tags(
    p: &mut TaxPlan,
    affected: Vec<(String, Tag)>,
    to: &TagMove,
    gone: impl Fn(&str, &str) -> bool,
) -> Result<(), String> {
    let op = match to {
        TagMove::Partial => None,
        TagMove::Technique {
            technique_id,
            branch_id,
        } => {
            let linked = p
                .tax
                .branch_techniques
                .iter()
                .any(|l| l.technique_id == *technique_id && l.branch_id == *branch_id);
            let branch = p.tax.branches.iter().find(|b| b.id == *branch_id);
            match branch {
                Some(b) if linked && !gone(technique_id, branch_id) => Some(b.operation_id.clone()),
                _ => return Err("BadMoveTarget".into()),
            }
        }
    };
    for tagged in affected {
        let t = tagged.1.clone();
        let after = match (to, &op) {
            (
                TagMove::Technique {
                    technique_id,
                    branch_id,
                },
                Some(op),
            ) => Tag {
                operation_id: op.clone(),
                technique_id: Some(technique_id.clone()),
                branch_id: Some(branch_id.clone()),
                suggested: false,
                ..t
            },
            _ => Tag {
                technique_id: None,
                branch_id: None,
                ..t
            },
        };
        p.replace(tagged, after)?;
    }
    Ok(())
}

/// Whitespace collapsed and non-empty, and no other item (`own` excepted) has the same
/// `name_key` (ruling B6): else `Err("EmptyName")` or `Err("<taken>:<id>")`.
fn unique_name<'a>(
    name: &str,
    others: impl IntoIterator<Item = (&'a str, &'a str)>,
    own: &str,
    taken: &str,
) -> Result<String, String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err("EmptyName".into());
    }
    let key = name_key(&name);
    let mut others = others.into_iter();
    match others.find(|(id, n)| *id != own && name_key(n) == key) {
        Some((id, _)) => Err(format!("{taken}:{id}")),
        None => Ok(name),
    }
}

fn unknown(kind: &str, id: &str) -> String {
    format!("unknown {kind}: {id}")
}

fn check_ink(color: &str) -> Result<(), String> {
    if EXTRA_INKS.contains(&color) {
        Ok(())
    } else {
        Err("UnknownInk".into())
    }
}

fn check_icon(icon: &str) -> Result<(), String> {
    if DOMAIN_ICONS.contains(&icon) {
        Ok(())
    } else {
        Err("UnknownIcon".into())
    }
}

/// Rename, define or set synonyms. IPC args: `{ id, patch }`.
#[tauri::command]
pub fn update_technique<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    patch: TechniquePatch,
) -> Result<Change, String> {
    commit(&app, |o| {
        let before = o.tax.techniques.iter().find(|t| t.id == id);
        let before = before.ok_or_else(|| unknown("technique", &id))?.clone();
        let mut after = before.clone();
        if let Some(name) = &patch.name {
            let others = o.tax.techniques.iter();
            let others = others.map(|t| (t.id.as_str(), t.name.as_str()));
            after.name = unique_name(name, others, &id, "NameTaken")?;
        }
        if let Some(d) = &patch.description {
            after.description = d.trim().into();
        }
        if let Some(s) = &patch.synonyms {
            let s = s.iter().map(|s| s.trim()).filter(|s| !s.is_empty());
            after.synonyms = s.map(str::to_owned).collect();
        }
        Ok((Edit::UpdateTechnique { before, after }, None))
    })
}

/// IPC args: `{ id, patch }`.
#[tauri::command]
pub fn update_domain<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    patch: DomainPatch,
) -> Result<Change, String> {
    commit(&app, |o| {
        let before = o.tax.domains.iter().find(|d| d.id == id);
        let before = before.ok_or_else(|| unknown("domain", &id))?.clone();
        let mut after = before.clone();
        if let Some(name) = &patch.name {
            let others = o.tax.domains.iter();
            let others = others.map(|d| (d.id.as_str(), d.name.as_str()));
            after.name = unique_name(name, others, &id, "NameTaken")?;
        }
        if let Some(d) = &patch.description {
            after.description = d.trim().into();
        }
        if let Some(icon) = patch.icon {
            check_icon(&icon)?;
            after.icon = icon;
        }
        Ok((Edit::UpdateDomain { before, after }, None))
    })
}

/// With `operation_id`, the domain and its branch under that operation are one undo step.
/// `Change.created` is the new id. IPC args: `{ name, description, icon, operationId }`.
#[tauri::command]
pub fn add_domain<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    description: String,
    icon: Option<String>,
    operation_id: Option<String>,
) -> Result<Change, String> {
    commit(&app, |o| {
        let others = o.tax.domains.iter();
        let name = unique_name(
            &name,
            others.map(|d| (d.id.as_str(), d.name.as_str())),
            "",
            "NameTaken",
        )?;
        let icon = icon.unwrap_or_else(|| PLAIN_ICON.into());
        check_icon(&icon)?;
        let taken: HashSet<&str> = o.tax.domains.iter().map(|d| d.id.as_str()).collect();
        let id = free_id(&name, &taken);
        let domain = Domain {
            id: id.clone(),
            name,
            icon,
            description: description.trim().into(),
            extra: Default::default(),
        };
        let add = Edit::AddDomain { domain };
        let edit = match operation_id {
            None => add,
            Some(op) => {
                let branch = Branch {
                    id: format!("{op}.{id}"),
                    operation_id: op,
                    domain_id: id.clone(),
                    extra: Default::default(),
                };
                Edit::Batch(vec![add, Edit::AddBranch { branch }])
            }
        };
        Ok((edit, Some(id)))
    })
}

/// `Err("NeedsMove")` while a branch uses the domain and `move_to` is `None`.
/// IPC args: `{ id, moveTo }`.
#[tauri::command]
pub fn delete_domain<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    move_to: Option<DomainMove>,
) -> Result<Change, String> {
    commit_counted(&app, |o| {
        if !o.tax.domains.iter().any(|d| d.id == id) {
            return Err(unknown("domain", &id));
        }
        let mut p = TaxPlan::new(&o.lib.data, &o.tax);
        let branches = o.tax.branches.iter();
        let branches: Vec<Branch> = branches.filter(|b| b.domain_id == id).cloned().collect();
        match needs_move(!branches.is_empty(), move_to)? {
            None => {}
            Some(DomainMove::Domain { domain_id }) => {
                if domain_id == id || !o.tax.domains.iter().any(|d| d.id == domain_id) {
                    return Err("BadMoveTarget".into());
                }
                for b in &branches {
                    rekey_branch(&mut p, &b.id, &b.operation_id, &domain_id)?;
                }
            }
            Some(DomainMove::Delete) => {
                let ids: Vec<String> = branches.iter().map(|b| b.id.clone()).collect();
                let on = |t: &Tag| t.branch_id.as_ref().is_some_and(|b| ids.contains(b));
                let affected = p.tags(on);
                move_tags(&mut p, affected, &TagMove::Partial, |_, _| false)?;
                drop_branches(&mut p, &ids);
            }
        }
        p.domains.push(id.clone());
        let made_partial = p.made_partial;
        Ok((p.finish()?, None, made_partial))
    })
}

/// `Change.created` is the new id; `color` `None` takes the first free extra ink.
/// IPC args: `{ name, plainLabel, description, color }`.
#[tauri::command]
pub fn add_operation<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    plain_label: String,
    description: String,
    color: Option<String>,
) -> Result<Change, String> {
    commit(&app, |o| {
        let ops = &o.tax.operations;
        if ops.len() >= MAX_OPS {
            return Err("TooManyOperations".into());
        }
        let names = ops.iter().map(|o| (o.id.as_str(), o.name.as_str()));
        let name = unique_name(&name, names, "", "NameTaken")?;
        let labels = ops.iter().map(|o| (o.id.as_str(), o.plain_label.as_str()));
        let plain_label = unique_name(&plain_label, labels, "", "LabelTaken")?;
        let color = match color {
            Some(c) => check_ink(&c).map(|()| Some(c))?,
            None => EXTRA_INKS
                .iter()
                .find(|ink| !ops.iter().any(|o| o.color.as_deref() == Some(**ink)))
                .map(|ink| ink.to_string()),
        };
        let taken: HashSet<&str> = ops.iter().map(|o| o.id.as_str()).collect();
        let id = free_id(&name, &taken);
        let op = Operation {
            id: id.clone(),
            name,
            plain_label,
            color,
            icon: PLAIN_ICON.into(),
            description: description.trim().into(),
            extra: Default::default(),
        };
        Ok((Edit::AddOperation { op }, Some(id)))
    })
}

/// IPC args: `{ id, patch }`.
#[tauri::command]
pub fn update_operation<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    patch: OperationPatch,
) -> Result<Change, String> {
    commit(&app, |o| {
        let ops = &o.tax.operations;
        let before = ops.iter().find(|x| x.id == id);
        let before = before.ok_or_else(|| unknown("operation", &id))?.clone();
        let mut after = before.clone();
        if let Some(name) = &patch.name {
            let names = ops.iter().map(|o| (o.id.as_str(), o.name.as_str()));
            after.name = unique_name(name, names, &id, "NameTaken")?;
        }
        if let Some(label) = &patch.plain_label {
            let labels = ops.iter().map(|o| (o.id.as_str(), o.plain_label.as_str()));
            after.plain_label = unique_name(label, labels, &id, "LabelTaken")?;
        }
        if let Some(d) = &patch.description {
            after.description = d.trim().into();
        }
        if let Some(color) = patch.color {
            if let Some(c) = &color {
                check_ink(c)?;
            }
            after.color = color;
        }
        Ok((Edit::UpdateOperation { before, after }, None))
    })
}

/// `Err("LastOperation")` for the only one; `Err("NeedsMove")` while a branch or tag uses it and
/// `move_to` is `None`. IPC args: `{ id, moveTo }`.
#[tauri::command]
pub fn delete_operation<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    move_to: Option<OpMove>,
) -> Result<Change, String> {
    commit_counted(&app, |o| {
        if !o.tax.operations.iter().any(|x| x.id == id) {
            return Err(unknown("operation", &id));
        }
        if o.tax.operations.len() == 1 {
            return Err("LastOperation".into());
        }
        let mut p = TaxPlan::new(&o.lib.data, &o.tax);
        let branches = o.tax.branches.iter();
        let branches: Vec<Branch> = branches.filter(|b| b.operation_id == id).cloned().collect();
        let used = !branches.is_empty() || !p.tags(|t| t.operation_id == id).is_empty();
        match needs_move(used, move_to)? {
            None => {}
            Some(OpMove::Operation { operation_id }) => {
                if operation_id == id || !o.tax.operations.iter().any(|x| x.id == operation_id) {
                    return Err("BadMoveTarget".into());
                }
                for b in &branches {
                    rekey_branch(&mut p, &b.id, &operation_id, &b.domain_id)?;
                }
                for tagged in p.tags(|t| t.operation_id == id && t.technique_id.is_none()) {
                    let after = Tag {
                        operation_id: operation_id.clone(),
                        ..tagged.1.clone()
                    };
                    p.replace(tagged, after)?;
                }
            }
            Some(OpMove::Delete) => {
                for r in &o.lib.data.references {
                    let removed = r.tags.iter().cloned().enumerate();
                    let removed: Vec<(usize, Tag)> =
                        removed.filter(|(_, t)| t.operation_id == id).collect();
                    if !removed.is_empty() {
                        let ref_id = r.id.clone();
                        p.push(Edit::RemoveTags { ref_id, removed })?;
                    }
                }
                let ids: Vec<String> = branches.iter().map(|b| b.id.clone()).collect();
                drop_branches(&mut p, &ids);
            }
        }
        p.operations.push(id.clone());
        let made_partial = p.made_partial;
        Ok((p.finish()?, None, made_partial))
    })
}

/// Drag to link (S3). IPC args: `{ techniqueId, branchId }`.
#[tauri::command]
pub fn link_technique<R: Runtime>(
    app: AppHandle<R>,
    technique_id: String,
    branch_id: String,
) -> Result<Change, String> {
    commit(&app, |_| {
        let link = BranchTechnique {
            branch_id,
            technique_id,
            source: "drafted".into(),
            rationale: "Linked by the artist in the tree.".into(),
            extra: Default::default(),
        };
        Ok((Edit::LinkTechnique { link }, None))
    })
}

/// `Err("LastLink")` for a technique's only link (delete it instead); `Err("NeedsMove")` while
/// tags use the pair and `move_to` is `None` (R20). IPC args: `{ techniqueId, branchId, moveTo }`.
#[tauri::command]
pub fn unlink_technique<R: Runtime>(
    app: AppHandle<R>,
    technique_id: String,
    branch_id: String,
    move_to: Option<TagMove>,
) -> Result<Change, String> {
    commit(&app, |o| {
        let links = &o.tax.branch_techniques;
        let pair = |t: &str, b: &str| t == technique_id && b == branch_id;
        if !links.iter().any(|l| pair(&l.technique_id, &l.branch_id)) {
            return Err(unknown("link", &format!("{branch_id} -> {technique_id}")));
        }
        if links
            .iter()
            .filter(|l| l.technique_id == technique_id)
            .count()
            == 1
        {
            return Err("LastLink".into());
        }
        let mut p = TaxPlan::new(&o.lib.data, &o.tax);
        let affected = p.tags(|t| {
            t.technique_id.as_deref() == Some(&technique_id)
                && t.branch_id.as_deref() == Some(&branch_id)
        });
        if let Some(to) = needs_move(!affected.is_empty(), move_to)? {
            move_tags(&mut p, affected, &to, pair)?;
        }
        p.links.push((branch_id.clone(), technique_id.clone()));
        Ok((p.finish()?, None))
    })
}

/// `Err("NeedsMove")` while tags use it and `move_to` is `None`. IPC args: `{ id, moveTo }`.
#[tauri::command]
pub fn delete_technique<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    move_to: Option<TagMove>,
) -> Result<Change, String> {
    commit(&app, |o| {
        if !o.tax.techniques.iter().any(|t| t.id == id) {
            return Err(unknown("technique", &id));
        }
        let mut p = TaxPlan::new(&o.lib.data, &o.tax);
        let affected = p.tags(|t| t.technique_id.as_deref() == Some(&id));
        if let Some(to) = needs_move(!affected.is_empty(), move_to)? {
            move_tags(&mut p, affected, &to, |t, _| t == id)?;
        }
        p.techniques.push(id.clone());
        Ok((p.finish()?, None))
    })
}

/// "+" on the domain band: the branch `<operation_id>.<domain_id>`.
/// IPC args: `{ operationId, domainId }`.
#[tauri::command]
pub fn add_branch<R: Runtime>(
    app: AppHandle<R>,
    operation_id: String,
    domain_id: String,
) -> Result<Change, String> {
    commit(&app, |_| {
        let branch = Branch {
            id: format!("{operation_id}.{domain_id}"),
            operation_id,
            domain_id,
            extra: Default::default(),
        };
        Ok((Edit::AddBranch { branch }, None))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tests::*;
    use std::fs;

    fn tg(id: &str, op: &str, tech: Option<(&str, &str)>) -> Tag {
        Tag {
            id: id.into(),
            operation_id: op.into(),
            technique_id: tech.map(|(t, _)| t.into()),
            branch_id: tech.map(|(_, b)| b.into()),
            region: None,
            suggested: false,
        }
    }

    fn with_region(t: Tag) -> Tag {
        Tag {
            region: Some(Region {
                x: 0.1,
                y: 0.1,
                w: 0.5,
                h: 0.5,
            }),
            ..t
        }
    }

    /// The seed taxonomy plus three references, opened from disk:
    /// r1 = rim light (with a region), chiaroscuro; r2 = rim light, partial group (region),
    /// chiaroscuro under sequence; r3 = color blocking, body vector (region), partial infer,
    /// symmetry.
    fn lib3_with(tags: [Vec<Tag>; 3]) -> Env {
        let e = created();
        let refs: Vec<serde_json::Value> = tags
            .into_iter()
            .enumerate()
            .map(|(i, tags)| {
                let hash = format!("{:064x}", i + 1);
                serde_json::json!({ "id": format!("r{}", i + 1), "title": format!("Plate {}", i + 1),
                    "file": format!("{hash}.jpg"), "hash": hash, "width": 10, "height": 10,
                    "addedAt": "2026-11-25T00:00:00Z", "tags": tags })
            })
            .collect();
        let mut json = saved(&e);
        json["references"] = refs.into();
        fs::write(
            Path::new(&e.lib).join("library.json"),
            serde_json::to_vec(&json).unwrap(),
        )
        .unwrap();
        open_library(e.handle(), e.lib.clone()).unwrap();
        e
    }

    fn lib3() -> Env {
        let df = "differentiate.feature";
        lib3_with([
            vec![
                with_region(tg("t1", "differentiate", Some(("rim-light", df)))),
                tg("t2", "differentiate", Some(("chiaroscuro", df))),
            ],
            vec![
                tg("t3", "differentiate", Some(("rim-light", df))),
                with_region(tg("t4", "group", None)),
                tg("t5", "sequence", Some(("chiaroscuro", "sequence.feature"))),
            ],
            vec![
                tg("t6", "group", Some(("color-blocking", "group.feature"))),
                with_region(tg("t7", "group", Some(("body-vector", "group.social")))),
                tg("t8", "infer", None),
                tg("t9", "group", Some(("symmetry", "group.grouping"))),
            ],
        ])
    }

    fn with_open<T>(e: &Env, f: impl FnOnce(&Open) -> T) -> T {
        f(lock(&st(e).open).as_ref().unwrap())
    }

    /// Library data and taxonomy, value-equal through `serde_json::Value`.
    fn snapshot(e: &Env) -> (serde_json::Value, serde_json::Value) {
        with_open(e, |o| {
            let data = serde_json::to_value(&o.lib.data).unwrap();
            (data, serde_json::to_value(&o.tax).unwrap())
        })
    }

    fn tax_of(e: &Env) -> Taxonomy {
        get_taxonomy(e.handle()).unwrap()
    }

    fn tag_of(e: &Env, id: &str) -> Tag {
        with_open(e, |o| {
            let mut all = o.lib.data.references.iter().flat_map(|r| &r.tags);
            all.find(|t| t.id == id).unwrap().clone()
        })
    }

    fn can_undo(e: &Env) -> bool {
        with_open(e, |o| o.history.can_undo())
    }

    fn rename(name: &str) -> TechniquePatch {
        TechniquePatch {
            name: Some(name.into()),
            ..Default::default()
        }
    }

    fn to(technique: &str, branch: &str) -> Option<TagMove> {
        Some(TagMove::Technique {
            technique_id: technique.into(),
            branch_id: branch.into(),
        })
    }

    fn has_link(tax: &Taxonomy, branch: &str, technique: &str) -> bool {
        let mut links = tax.branch_techniques.iter();
        links.any(|l| l.branch_id == branch && l.technique_id == technique)
    }

    #[test]
    fn rename_collision() {
        let e = lib3();
        let h = e.handle();
        let err = update_technique(h.clone(), "chiaroscuro".into(), rename("POP-OUT "));
        assert_eq!(err.unwrap_err(), "NameTaken:pop-out");
        assert_eq!(
            update_technique(h.clone(), "chiaroscuro".into(), rename("  ")).unwrap_err(),
            "EmptyName"
        );
        // Only case and spacing count (ruling B6): the hyphen makes "Pop out" another name.
        let c = update_technique(h, "chiaroscuro".into(), rename("Pop  out")).unwrap();
        let tax = c.taxonomy.unwrap();
        assert_eq!(tax.techniques[0].name, "Pop out");
        assert_eq!(tax.techniques[0].id, "chiaroscuro");
    }

    #[test]
    fn rename_to_own_name_case() {
        let e = lib3();
        let c = update_technique(e.handle(), "chiaroscuro".into(), rename("chiaroscuro")).unwrap();
        assert_eq!(c.taxonomy.unwrap().techniques[0].name, "chiaroscuro");
        assert!(c.can_undo);
    }

    #[test]
    fn noop_rename_records_nothing() {
        let e = lib3();
        assert!(!can_undo(&e));
        let c = update_technique(e.handle(), "chiaroscuro".into(), rename("Chiaroscuro")).unwrap();
        assert!(!c.can_undo);
        assert!(!can_undo(&e));
    }

    #[test]
    fn delete_moves_tags_and_undo_restores() {
        let e = lib3();
        let before = snapshot(&e);
        let (t1, t3) = (tag_of(&e, "t1"), tag_of(&e, "t3"));
        let c = delete_technique(
            e.handle(),
            "rim-light".into(),
            to("silhouette", "differentiate.feature"),
        )
        .unwrap();
        let tax = c.taxonomy.as_ref().unwrap();
        assert!(!tax.techniques.iter().any(|t| t.id == "rim-light"));
        assert!(
            !tax.branch_techniques
                .iter()
                .any(|l| l.technique_id == "rim-light")
        );
        let mut ids: Vec<&str> = c
            .references
            .iter()
            .map(|r| r.reference.id.as_str())
            .collect();
        ids.sort();
        assert_eq!(ids, ["r1", "r2"]);
        for (old, id) in [(t1, "t1"), (t3, "t3")] {
            let t = tag_of(&e, id);
            assert_eq!(t.technique_id.as_deref(), Some("silhouette"));
            assert_eq!(t.branch_id.as_deref(), Some("differentiate.feature"));
            assert_eq!(t.region, old.region, "{id} keeps its region");
            assert!(!t.suggested);
        }
        assert!(tag_of(&e, "t1").region.is_some());
        let c = undo(e.handle()).unwrap();
        assert!(c.taxonomy.is_some());
        assert_eq!(snapshot(&e), before, "technique, links and tags in place");
        // Redo applies it again through the sealed inverses.
        redo(e.handle()).unwrap();
        assert_eq!(tag_of(&e, "t3").technique_id.as_deref(), Some("silhouette"));
    }

    #[test]
    fn delete_to_partial() {
        let e = lib3();
        let before = snapshot(&e);
        delete_technique(e.handle(), "rim-light".into(), Some(TagMove::Partial)).unwrap();
        let t1 = tag_of(&e, "t1");
        assert_eq!(
            t1,
            with_region(tg("t1", "differentiate", None)),
            "operation and region only"
        );
        assert_eq!(tag_of(&e, "t3"), tg("t3", "differentiate", None));
        // Review Focus 4: one undo restores the technique, its link and both tags in place.
        let c = undo(e.handle()).unwrap();
        assert!(!c.can_undo, "one step");
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn unlink_with_move_undo_restores() {
        let e = lib3();
        let before = snapshot(&e);
        unlink_technique(
            e.handle(),
            "chiaroscuro".into(),
            "sequence.feature".into(),
            to("size-hierarchy", "sequence.feature"),
        )
        .unwrap();
        assert!(!has_link(&tax_of(&e), "sequence.feature", "chiaroscuro"));
        assert_eq!(
            tag_of(&e, "t5").technique_id.as_deref(),
            Some("size-hierarchy")
        );
        // Review Focus 4: one undo restores the link (at its index) and the tag in place.
        let c = undo(e.handle()).unwrap();
        assert!(!c.can_undo, "one step");
        assert_eq!(snapshot(&e), before);
    }

    /// I1: dangling tags (R16) on a re-keyed branch become partial tags; the move goes ahead.
    #[test]
    fn rekey_turns_stale_tags_partial() {
        let gf = "group.feature";
        let e = lib3_with([
            vec![tg("t1", "group", Some(("color-blocking", gf)))],
            vec![
                // A removed technique, and one that is not linked on its branch.
                with_region(tg("s1", "group", Some(("ghost", gf)))),
                tg("s2", "group", Some(("leading-lines", gf))),
            ],
            vec![tg(
                "t2",
                "differentiate",
                Some(("chiaroscuro", "differentiate.feature")),
            )],
        ]);
        let before = snapshot(&e);
        let target = Some(OpMove::Operation {
            operation_id: "differentiate".into(),
        });
        let c = delete_operation(e.handle(), "group".into(), target).unwrap();
        assert_eq!(c.made_partial, 2);
        assert_eq!(serde_json::to_value(&c).unwrap()["madePartial"], 2);
        assert_eq!(
            tag_of(&e, "s1"),
            with_region(tg("s1", "differentiate", None))
        );
        assert_eq!(tag_of(&e, "s2"), tg("s2", "differentiate", None));
        let t1 = tag_of(&e, "t1");
        assert_eq!(t1.branch_id.as_deref(), Some("differentiate.feature"));
        // Undo puts the stale tags back exactly, in position.
        let c = undo(e.handle()).unwrap();
        assert_eq!(c.made_partial, 0);
        assert_eq!(snapshot(&e), before);
        assert_eq!(tag_of(&e, "s1").technique_id.as_deref(), Some("ghost"));

        // A domain move takes the same path.
        let target = Some(DomainMove::Domain {
            domain_id: "grouping".into(),
        });
        let c = delete_domain(e.handle(), "feature".into(), target).unwrap();
        assert_eq!(c.made_partial, 2);
        assert_eq!(tag_of(&e, "s2"), tg("s2", "group", None));
        assert_eq!(
            tag_of(&e, "t2").branch_id.as_deref(),
            Some("differentiate.grouping")
        );
        undo(e.handle()).unwrap();
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn unlink_last_link_refused() {
        let e = lib3();
        let before = snapshot(&e);
        let err = unlink_technique(
            e.handle(),
            "rim-light".into(),
            "differentiate.feature".into(),
            Some(TagMove::Partial),
        );
        assert_eq!(err.unwrap_err(), "LastLink");
        assert!(!can_undo(&e));
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn unlink_unused_pair_needs_no_move() {
        let e = lib3();
        let before = snapshot(&e);
        let used = unlink_technique(
            e.handle(),
            "chiaroscuro".into(),
            "sequence.feature".into(),
            None,
        );
        assert_eq!(used.unwrap_err(), "NeedsMove");
        assert_eq!(snapshot(&e), before);
        let c = unlink_technique(
            e.handle(),
            "face-schema".into(),
            "infer.social".into(),
            None,
        )
        .unwrap();
        let tax = c.taxonomy.unwrap();
        assert!(!has_link(&tax, "infer.social", "face-schema"));
        assert!(has_link(&tax, "group.social", "face-schema"));
        assert!(c.can_undo);
        // A used pair with a move: the tags follow, in the same step.
        unlink_technique(
            e.handle(),
            "chiaroscuro".into(),
            "sequence.feature".into(),
            to("size-hierarchy", "sequence.feature"),
        )
        .unwrap();
        assert_eq!(
            tag_of(&e, "t5").technique_id.as_deref(),
            Some("size-hierarchy")
        );
        let bad = unlink_technique(
            e.handle(),
            "chiaroscuro".into(),
            "differentiate.feature".into(),
            to("chiaroscuro", "differentiate.feature"),
        );
        assert_eq!(bad.unwrap_err(), "LastLink");
    }

    #[test]
    fn move_target_must_be_another_linked_pair() {
        let e = lib3();
        let h = e.handle();
        for target in [
            to("chiaroscuro", "sequence.feature"), // the technique being deleted
            to("silhouette", "group.feature"),     // not linked there
        ] {
            let err = delete_technique(h.clone(), "chiaroscuro".into(), target);
            assert_eq!(err.unwrap_err(), "BadMoveTarget");
        }
        let err = unlink_technique(
            h,
            "chiaroscuro".into(),
            "sequence.feature".into(),
            to("chiaroscuro", "sequence.feature"),
        );
        assert_eq!(err.unwrap_err(), "BadMoveTarget");
    }

    #[test]
    fn move_repoints_operation() {
        let e = lib3();
        let before = snapshot(&e);
        delete_technique(
            e.handle(),
            "chiaroscuro".into(),
            to("leading-lines", "sequence.space"),
        )
        .unwrap();
        for id in ["t2", "t5"] {
            let t = tag_of(&e, id);
            assert_eq!(t.operation_id, "sequence", "{id}");
            assert_eq!(t.technique_id.as_deref(), Some("leading-lines"));
            assert_eq!(t.branch_id.as_deref(), Some("sequence.space"));
        }
        undo(e.handle()).unwrap();
        assert_eq!(tag_of(&e, "t2").operation_id, "differentiate");
        assert_eq!(tag_of(&e, "t5").operation_id, "sequence");
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn unlink_many_descending() {
        let e = lib3();
        let (data, tax) = with_open(&e, |o| (o.lib.data.clone(), o.tax.clone()));
        let mut p = TaxPlan::new(&data, &tax);
        // Queued ascending; emitted descending.
        p.links
            .push(("differentiate.social".into(), "face-schema".into()));
        p.links.push(("infer.social".into(), "face-schema".into()));
        let batch = p.finish().unwrap();
        let Edit::Batch(parts) = &batch else { panic!() };
        let indices: Vec<usize> = parts
            .iter()
            .map(|e| match e {
                Edit::UnlinkTechnique { index, .. } => *index,
                other => panic!("{other:?}"),
            })
            .collect();
        assert_eq!(indices, [39, 17]);
        let (mut d, mut t) = (data.clone(), tax.clone());
        let applied = edit::apply(&mut d, &mut t, batch).unwrap();
        assert_eq!(t.branch_techniques.len(), tax.branch_techniques.len() - 2);
        assert!(!has_link(&t, "differentiate.social", "face-schema"));
        assert!(!has_link(&t, "infer.social", "face-schema"));
        assert!(has_link(&t, "group.social", "face-schema"));
        edit::apply_inverse(&mut d, &mut t, applied.inverse).unwrap();
        assert_eq!(t, tax, "the original branchTechniques order");
    }

    #[test]
    fn delete_unused_needs_no_move() {
        let e = lib3();
        add_technique(e.handle(), halo(), None).unwrap();
        let c = delete_technique(e.handle(), "halo-glow".into(), None).unwrap();
        assert!(
            !c.taxonomy
                .unwrap()
                .techniques
                .iter()
                .any(|t| t.id == "halo-glow")
        );
        let before = snapshot(&e);
        let err = delete_technique(e.handle(), "rim-light".into(), None);
        assert_eq!(err.unwrap_err(), "NeedsMove");
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn tag_move_json_camel() {
        let m = TagMove::Technique {
            technique_id: "silhouette".into(),
            branch_id: "differentiate.feature".into(),
        };
        let v = serde_json::to_value(&m).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "technique", "techniqueId": "silhouette",
                "branchId": "differentiate.feature"})
        );
        assert_eq!(serde_json::from_value::<TagMove>(v).unwrap(), m);
        let partial = serde_json::json!({"kind": "partial"});
        assert_eq!(serde_json::to_value(TagMove::Partial).unwrap(), partial);
        let d = serde_json::json!({"kind": "domain", "domainId": "semantic"});
        let d: DomainMove = serde_json::from_value(d).unwrap();
        assert_eq!(
            d,
            DomainMove::Domain {
                domain_id: "semantic".into()
            }
        );
    }

    #[test]
    fn op_move_json_camel() {
        let m = OpMove::Operation {
            operation_id: "differentiate".into(),
        };
        let v = serde_json::to_value(&m).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "operation", "operationId": "differentiate"})
        );
        assert_eq!(serde_json::from_value::<OpMove>(v).unwrap(), m);
        let delete = serde_json::json!({"kind": "delete"});
        assert_eq!(
            serde_json::from_value::<OpMove>(delete).unwrap(),
            OpMove::Delete
        );
    }

    #[test]
    fn delete_technique_ipc_keys() {
        let e = lib3();
        let webview = tauri::WebviewWindowBuilder::new(&e.app, "main", Default::default())
            .build()
            .unwrap();
        let res = tauri::test::get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "delete_technique".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: serde_json::json!({ "id": "rim-light", "moveTo": {"kind": "partial"} })
                    .into(),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        );
        let c: serde_json::Value = res.unwrap().deserialize().unwrap();
        assert_eq!(c["canUndo"], true);
        assert_eq!(tag_of(&e, "t1").technique_id, None);
    }

    #[test]
    fn add_branch_then_link() {
        let e = lib3();
        let before = snapshot(&e);
        let c = add_branch(e.handle(), "group".into(), "semantic".into()).unwrap();
        let tax = c.taxonomy.unwrap();
        assert!(tax.branches.iter().any(|b| b.id == "group.semantic"
            && b.operation_id == "group"
            && b.domain_id == "semantic"));
        let c = link_technique(
            e.handle(),
            "semantic-compounding".into(),
            "group.semantic".into(),
        )
        .unwrap();
        let tax = c.taxonomy.unwrap();
        assert_eq!(tax.validate(), Ok(()));
        assert!(has_link(&tax, "group.semantic", "semantic-compounding"));
        // The same pair again is refused at the edit level.
        assert!(add_branch(e.handle(), "group".into(), "semantic".into()).is_err());
        assert!(
            link_technique(
                e.handle(),
                "semantic-compounding".into(),
                "group.semantic".into()
            )
            .is_err()
        );
        undo(e.handle()).unwrap();
        undo(e.handle()).unwrap();
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn commit_reverts_new_validate_errors() {
        let e = lib3();
        let before = snapshot(&e);
        let tax = tax_of(&e);
        let index = tax
            .branch_techniques
            .iter()
            .position(|l| l.technique_id == "rim-light")
            .unwrap();
        let link = tax.branch_techniques[index].clone();
        // `apply` takes this (no tag uses silhouette), but it leaves silhouette unlinked.
        let index = tax
            .branch_techniques
            .iter()
            .position(|l| l.technique_id == "silhouette")
            .unwrap();
        let only = tax.branch_techniques[index].clone();
        let bad = Edit::Batch(vec![Edit::UnlinkTechnique { index, link: only }]);
        let err = commit(&e.handle(), |_| Ok((bad, None))).unwrap_err();
        assert_eq!(err, "silhouette: technique without a branch");
        assert_eq!(snapshot(&e), before);
        assert!(!can_undo(&e));
        // An edit that `apply` refuses leaves nothing either.
        let in_use = Edit::UnlinkTechnique {
            index: tax
                .branch_techniques
                .iter()
                .position(|l| *l == link)
                .unwrap(),
            link,
        };
        assert!(commit(&e.handle(), |_| Ok((in_use, None))).is_err());
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn commit_tolerates_existing_problems() {
        let e = created();
        let path = Path::new(&e.lib).join("taxonomy.json");
        let mut tax: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let first = tax["operations"][0].clone();
        tax["operations"].as_array_mut().unwrap().push(first);
        fs::write(&path, serde_json::to_vec(&tax).unwrap()).unwrap();
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        assert!(view.warning.unwrap().contains("duplicate operation id"));
        let c = update_technique(e.handle(), "chiaroscuro".into(), rename("Light and shadow"));
        assert_eq!(
            c.unwrap().taxonomy.unwrap().techniques[0].name,
            "Light and shadow"
        );
    }

    fn add_op(e: &Env, name: &str, label: &str) -> Result<Change, String> {
        add_operation(e.handle(), name.into(), label.into(), "".into(), None)
    }

    fn op<'a>(tax: &'a Taxonomy, id: &str) -> &'a Operation {
        tax.operations.iter().find(|o| o.id == id).unwrap()
    }

    #[test]
    fn add_operation_defaults_ink() {
        let e = lib3();
        let c = add_op(&e, "Pulse", "Keep the beat").unwrap();
        assert_eq!(c.created.as_deref(), Some("pulse"));
        let tax = c.taxonomy.unwrap();
        assert_eq!(op(&tax, "pulse").color.as_deref(), Some("teal"));
        assert_eq!(op(&tax, "pulse").icon, "a plain square");
        let c = add_op(&e, "Echo", "Say it again").unwrap();
        assert_eq!(
            op(&c.taxonomy.unwrap(), "echo").color.as_deref(),
            Some("olive")
        );
        let c = undo(e.handle()).unwrap();
        assert!(
            !c.taxonomy
                .unwrap()
                .operations
                .iter()
                .any(|o| o.id == "echo")
        );
        assert_eq!(add_op(&e, "pulse ", "x").unwrap_err(), "NameTaken:pulse");
        assert_eq!(
            add_op(&e, "X", " keep  the BEAT").unwrap_err(),
            "LabelTaken:pulse"
        );
        let ink = add_operation(
            e.handle(),
            "X".into(),
            "X".into(),
            "".into(),
            Some("red".into()),
        );
        assert_eq!(ink.unwrap_err(), "UnknownInk");
        for n in 6..=9 {
            add_op(&e, &format!("Op {n}"), &format!("Label {n}")).unwrap();
        }
        let tax = tax_of(&e);
        assert_eq!(tax.operations.len(), MAX_OPS);
        assert_eq!(op(&tax, "op-9").color.as_deref(), Some("umber"));
        assert_eq!(
            add_op(&e, "Op 10", "Label 10").unwrap_err(),
            "TooManyOperations"
        );
    }

    #[test]
    fn rename_operation_label() {
        let e = lib3();
        let patch = |v: serde_json::Value| serde_json::from_value::<OperationPatch>(v).unwrap();
        let c = update_operation(
            e.handle(),
            "differentiate".into(),
            patch(serde_json::json!({"plainLabel": "Pop"})),
        )
        .unwrap();
        assert_eq!(op(&c.taxonomy.unwrap(), "differentiate").plain_label, "Pop");
        let dup = update_operation(
            e.handle(),
            "group".into(),
            patch(serde_json::json!({"plainLabel": " POP "})),
        );
        assert_eq!(dup.unwrap_err(), "LabelTaken:differentiate");
        let dup = update_operation(
            e.handle(),
            "group".into(),
            patch(serde_json::json!({"name": "differentiate"})),
        );
        assert_eq!(dup.unwrap_err(), "NameTaken:differentiate");
        let hits = search(e.handle(), "pop".into()).unwrap();
        assert!(
            hits.iter()
                .any(|h| matches!(h, Hit::Technique { id, operation_id, .. }
                if id == "chiaroscuro" && operation_id == "differentiate")),
            "{hits:?}"
        );
    }

    #[test]
    fn reink_seed_operation() {
        let e = lib3();
        let set = |v: serde_json::Value| {
            let p: OperationPatch = serde_json::from_value(v).unwrap();
            let c = update_operation(e.handle(), "differentiate".into(), p);
            c.map(|c| op(&c.taxonomy.unwrap(), "differentiate").color.clone())
        };
        assert_eq!(
            set(serde_json::json!({"color": "rose"})),
            Ok(Some("rose".into()))
        );
        assert_eq!(set(serde_json::json!({"color": null})), Ok(None));
        set(serde_json::json!({"color": "rose"})).unwrap();
        assert_eq!(
            set(serde_json::json!({"name": "Differentiate!"})),
            Ok(Some("rose".into()))
        );
        assert_eq!(
            set(serde_json::json!({"color": "red"})),
            Err("UnknownInk".into())
        );
    }

    #[test]
    fn delete_operation_moves_branches() {
        let e = lib3();
        let before = snapshot(&e);
        let links0 = tax_of(&e).branch_techniques.len();
        let target = Some(OpMove::Operation {
            operation_id: "differentiate".into(),
        });
        let c = delete_operation(e.handle(), "group".into(), target).unwrap();
        let tax = c.taxonomy.unwrap();
        assert_eq!(tax.validate(), Ok(()), "no duplicate links");
        assert!(!tax.operations.iter().any(|o| o.id == "group"));
        assert!(!tax.branches.iter().any(|b| b.operation_id == "group"));
        for t in [
            "color-blocking",
            "limited-palette",
            "common-region",
            "symmetry",
            "body-vector",
        ] {
            assert!(
                tax.branches_for("differentiate", t).len() == 1,
                "{t} moved under differentiate"
            );
        }
        // face-schema was under both differentiate.social and group.social: merged, not doubled.
        let face = tax.branch_techniques.iter();
        let face = face
            .filter(|l| l.branch_id == "differentiate.social" && l.technique_id == "face-schema");
        assert_eq!(face.count(), 1);
        assert_eq!(tax.branch_techniques.len(), links0 - 1);
        for (id, branch) in [
            ("t4", None),
            ("t6", Some("differentiate.feature")),
            ("t7", Some("differentiate.social")),
            ("t9", Some("differentiate.grouping")),
        ] {
            let t = tag_of(&e, id);
            assert_eq!(t.operation_id, "differentiate", "{id}");
            assert_eq!(t.branch_id.as_deref(), branch, "{id}");
        }
        assert!(tag_of(&e, "t4").region.is_some());
        let c = undo(e.handle()).unwrap();
        assert!(!c.can_undo, "one step");
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn delete_operation_delete() {
        let e = lib3();
        let before = snapshot(&e);
        assert_eq!(
            delete_operation(e.handle(), "group".into(), None).unwrap_err(),
            "NeedsMove"
        );
        let c = delete_operation(e.handle(), "group".into(), Some(OpMove::Delete)).unwrap();
        let tax = c.taxonomy.unwrap();
        assert_eq!(tax.validate(), Ok(()));
        let data = with_open(&e, |o| o.lib.data.clone());
        let ids: Vec<&str> = data
            .references
            .iter()
            .flat_map(|r| &r.tags)
            .map(|t| t.id.as_str())
            .collect();
        assert_eq!(ids, ["t1", "t2", "t3", "t5", "t8"]);
        for gone in [
            "color-blocking",
            "common-region",
            "symmetry",
            "proximity-clustering",
            "limited-palette",
        ] {
            assert!(!tax.techniques.iter().any(|t| t.id == gone), "{gone}");
        }
        for kept in ["good-continuation", "closure", "face-schema", "body-vector"] {
            assert!(tax.techniques.iter().any(|t| t.id == kept), "{kept}");
        }
        undo(e.handle()).unwrap();
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn last_operation_refused() {
        let e = created();
        for id in ["differentiate", "group", "sequence"] {
            delete_operation(e.handle(), id.into(), Some(OpMove::Delete)).unwrap();
        }
        let tax = tax_of(&e);
        assert_eq!(tax.validate(), Ok(()));
        assert_eq!(tax.operations.len(), 1);
        let err = delete_operation(e.handle(), "infer".into(), Some(OpMove::Delete));
        assert_eq!(err.unwrap_err(), "LastOperation");
        let target = Some(OpMove::Operation {
            operation_id: "infer".into(),
        });
        undo(e.handle()).unwrap();
        let err = delete_operation(e.handle(), "infer".into(), target);
        assert_eq!(err.unwrap_err(), "BadMoveTarget");
    }

    #[test]
    fn delete_domain_moves_or_partials() {
        let e = lib3();
        let before = snapshot(&e);
        assert_eq!(
            delete_domain(e.handle(), "social".into(), None).unwrap_err(),
            "NeedsMove"
        );
        let target = Some(DomainMove::Domain {
            domain_id: "semantic".into(),
        });
        let c = delete_domain(e.handle(), "social".into(), target).unwrap();
        let tax = c.taxonomy.unwrap();
        assert_eq!(tax.validate(), Ok(()));
        assert!(!tax.domains.iter().any(|d| d.id == "social"));
        assert!(!tax.branches.iter().any(|b| b.domain_id == "social"));
        // Found by pair where one exists, minted where none does.
        for op in ["differentiate", "group", "sequence", "infer"] {
            let b = format!("{op}.semantic");
            assert!(tax.branches.iter().any(|x| x.id == b), "{b}");
        }
        assert!(has_link(&tax, "group.semantic", "body-vector"));
        let t7 = tag_of(&e, "t7");
        assert_eq!(t7.branch_id.as_deref(), Some("group.semantic"));
        assert_eq!(t7.operation_id, "group");
        assert!(!undo(e.handle()).unwrap().can_undo, "one step");
        assert_eq!(snapshot(&e), before);

        let c = delete_domain(e.handle(), "social".into(), Some(DomainMove::Delete)).unwrap();
        let tax = c.taxonomy.unwrap();
        assert_eq!(tax.validate(), Ok(()));
        assert_eq!(tag_of(&e, "t7"), with_region(tg("t7", "group", None)));
        for gone in ["face-schema", "body-vector", "gaze-cue", "direct-address"] {
            assert!(!tax.techniques.iter().any(|t| t.id == gone), "{gone}");
        }
        assert!(!undo(e.handle()).unwrap().can_undo, "one step");
        assert_eq!(snapshot(&e), before);
    }

    #[test]
    fn add_domain_then_branch() {
        let e = lib3();
        let c = add_domain(e.handle(), "Rhythm".into(), " Beats. ".into(), None, None).unwrap();
        assert_eq!(c.created.as_deref(), Some("rhythm"));
        let tax = c.taxonomy.unwrap();
        let d = tax.domains.iter().find(|d| d.id == "rhythm").unwrap();
        assert_eq!(
            (d.icon.as_str(), d.description.as_str()),
            ("a plain square", "Beats.")
        );
        add_branch(e.handle(), "sequence".into(), "rhythm".into()).unwrap();
        let c =
            link_technique(e.handle(), "leading-lines".into(), "sequence.rhythm".into()).unwrap();
        assert_eq!(c.taxonomy.unwrap().validate(), Ok(()));
        // Domain edits: a listed icon, a unique name.
        let patch = |v: serde_json::Value| serde_json::from_value::<DomainPatch>(v).unwrap();
        let icon = patch(serde_json::json!({"icon": "a dot inside a ring"}));
        update_domain(e.handle(), "rhythm".into(), icon).unwrap();
        let bad = update_domain(
            e.handle(),
            "rhythm".into(),
            patch(serde_json::json!({"icon": "x"})),
        );
        assert_eq!(bad.unwrap_err(), "UnknownIcon");
        let dup = update_domain(
            e.handle(),
            "rhythm".into(),
            patch(serde_json::json!({"name": "SPACE"})),
        );
        assert_eq!(dup.unwrap_err(), "NameTaken:space");
        let dup = add_domain(e.handle(), "rhythm".into(), "".into(), None, None);
        assert_eq!(dup.unwrap_err(), "NameTaken:rhythm");
        let icon = add_domain(
            e.handle(),
            "Pulse".into(),
            "".into(),
            Some("x".into()),
            None,
        );
        assert_eq!(icon.unwrap_err(), "UnknownIcon");
    }

    #[test]
    fn add_domain_with_op_is_one_step() {
        let e = lib3();
        let before = snapshot(&e);
        let op = Some("sequence".to_string());
        let c = add_domain(e.handle(), "Rhythm".into(), "…".into(), None, op).unwrap();
        let tax = c.taxonomy.unwrap();
        assert!(tax.domains.iter().any(|d| d.id == "rhythm"));
        assert!(tax.branches.iter().any(|b| b.id == "sequence.rhythm"));
        let c = undo(e.handle()).unwrap();
        assert!(!c.can_undo);
        assert_eq!(snapshot(&e), before);
    }

    /// The seed's `group` has 3 branches and 9 links (eight adjacent ones at 18-25, one at 51).
    #[test]
    fn multi_branch_batch_indices() {
        let e = lib3();
        let before = snapshot(&e);
        let tax0 = tax_of(&e);
        let group: Vec<String> = tax0
            .branches
            .iter()
            .filter(|b| b.operation_id == "group")
            .map(|b| b.id.clone())
            .collect();
        let on_group = |l: &BranchTechnique| group.contains(&l.branch_id);
        assert_eq!(
            (
                group.len(),
                tax0.branch_techniques
                    .iter()
                    .filter(|l| on_group(l))
                    .count()
            ),
            (3, 9)
        );
        delete_operation(e.handle(), "group".into(), Some(OpMove::Delete)).unwrap();
        let tax = tax_of(&e);
        let gone = [
            "color-blocking",
            "common-region",
            "symmetry",
            "proximity-clustering",
            "limited-palette",
        ];
        let mut branches = tax0.branches.clone();
        branches.retain(|b| !group.contains(&b.id));
        assert_eq!(tax.branches, branches);
        let mut links = tax0.branch_techniques.clone();
        links.retain(|l| !on_group(l));
        assert_eq!(tax.branch_techniques, links, "exactly those links");
        let mut techniques = tax0.techniques.clone();
        techniques.retain(|t| !gone.contains(&t.id.as_str()));
        assert_eq!(tax.techniques, techniques);
        undo(e.handle()).unwrap();
        assert_eq!(snapshot(&e), before, "the original order, value-equal");
    }

    #[test]
    fn dangling_tag_ids_open_and_render() {
        let ghost = tg("g1", "differentiate", Some(("ghost", "ghost.feature")));
        let e = lib3_with([vec![ghost.clone()], vec![], vec![]]);
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        let r1 = view
            .references
            .iter()
            .find(|r| r.reference.id == "r1")
            .unwrap();
        assert_eq!(r1.reference.tags, [ghost]);
    }

    #[test]
    fn extra_inks_match_ts() {
        let ts = include_str!("../../../src/ops.ts");
        let list = format!("{EXTRA_INKS:?}");
        assert!(
            ts.contains(&format!("EXTRA_INKS = {list} as const")),
            "ops.ts EXTRA_INKS differs from {list}"
        );
    }
}
