//! Undo and redo over the inverses `edit::apply` returns. In memory only; cleared on open and
//! create (Decision 2).

use crate::edit::{self, Edit, EditError, Touched};
use crate::model::LibraryData;
use crate::taxonomy::Taxonomy;

pub const HISTORY_CAP: usize = 200;

/// Each stack holds the edit to apply next.
#[derive(Debug, Default)]
pub struct History {
    undo: Vec<Edit>,
    redo: Vec<Edit>,
}

impl History {
    pub fn new() -> History {
        History::default()
    }

    /// A new edit's inverse. Clears redo; drops the oldest past `HISTORY_CAP`.
    // ponytail: a no-op (e.g. an empty `AddTags`) is recorded as a step; the brief is silent.
    // Skip it here or in the commands if an undo that does nothing shows up as a bug.
    pub fn record(&mut self, inverse: Edit) {
        self.redo.clear();
        self.undo.push(inverse);
        if self.undo.len() > HISTORY_CAP {
            self.undo.remove(0);
        }
    }

    pub fn undo(
        &mut self,
        data: &mut LibraryData,
        tax: &mut Taxonomy,
    ) -> Result<Option<Touched>, EditError> {
        step(&mut self.undo, &mut self.redo, data, tax)
    }

    pub fn redo(
        &mut self,
        data: &mut LibraryData,
        tax: &mut Taxonomy,
    ) -> Result<Option<Touched>, EditError> {
        step(&mut self.redo, &mut self.undo, data, tax)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    pub fn clear(&mut self) {
        self.undo.clear();
        self.redo.clear();
    }
}

/// Applies the top of `from` and pushes its inverse onto `to`. Both directions restore a state
/// that existed, so both go through `apply_inverse`. On `Err` the entry stays on `from`.
fn step(
    from: &mut Vec<Edit>,
    to: &mut Vec<Edit>,
    data: &mut LibraryData,
    tax: &mut Taxonomy,
) -> Result<Option<Touched>, EditError> {
    let Some(edit) = from.last().cloned() else {
        return Ok(None);
    };
    let applied = edit::apply_inverse(data, tax, edit)?;
    from.pop();
    to.push(applied.inverse);
    Ok(Some(applied.touched))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::edit::apply;
    use crate::model::{Reference, Tag};
    use std::path::PathBuf;

    fn reference(id: &str) -> Reference {
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
            tags: vec![],
        }
    }

    /// One untagged reference `r1` and the seed taxonomy.
    fn fixture() -> (LibraryData, Taxonomy) {
        let tax = Taxonomy::load(
            &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/taxonomy.json"),
        )
        .expect("seed loads");
        let data = LibraryData {
            version: 1,
            references: vec![reference("r1")],
            links: vec![],
            boards: vec![],
        };
        (data, tax)
    }

    /// Applies a one-tag `AddTags` on `r1` and records its inverse.
    fn add_tag(h: &mut History, data: &mut LibraryData, tax: &mut Taxonomy, id: &str) {
        let tag = Tag {
            id: id.into(),
            operation_id: tax.operations[0].id.clone(),
            technique_id: None,
            branch_id: None,
            region: None,
            suggested: false,
        };
        let add = Edit::AddTags {
            ref_id: "r1".into(),
            tags: vec![tag],
        };
        h.record(apply(data, tax, add).unwrap().inverse);
    }

    fn tag_ids(data: &LibraryData) -> Vec<&str> {
        data.references[0]
            .tags
            .iter()
            .map(|t| t.id.as_str())
            .collect()
    }

    #[test]
    fn undo_redo_roundtrip() {
        let (mut data, mut tax) = fixture();
        let mut h = History::new();
        let start = data.clone();
        add_tag(&mut h, &mut data, &mut tax, "a");
        add_tag(&mut h, &mut data, &mut tax, "b");
        let after = data.clone();

        for _ in 0..2 {
            let touched = h.undo(&mut data, &mut tax).unwrap().unwrap();
            assert_eq!(touched.ref_ids, ["r1"]);
        }
        assert_eq!(data, start);
        assert!(!h.can_undo() && h.can_redo());

        for _ in 0..2 {
            assert!(h.redo(&mut data, &mut tax).unwrap().is_some());
        }
        assert_eq!(data, after);
        assert!(h.can_undo() && !h.can_redo());
    }

    #[test]
    fn new_edit_clears_redo() {
        let (mut data, mut tax) = fixture();
        let mut h = History::new();
        add_tag(&mut h, &mut data, &mut tax, "a");
        h.undo(&mut data, &mut tax).unwrap();
        assert!(h.can_redo());
        add_tag(&mut h, &mut data, &mut tax, "b");
        assert!(!h.can_redo());
    }

    #[test]
    fn cap_drops_oldest() {
        let (mut data, mut tax) = fixture();
        let mut h = History::new();
        for i in 0..=HISTORY_CAP {
            add_tag(&mut h, &mut data, &mut tax, &format!("t{i}"));
        }
        for _ in 0..HISTORY_CAP {
            assert!(h.undo(&mut data, &mut tax).unwrap().is_some());
        }
        assert_eq!(h.undo(&mut data, &mut tax), Ok(None));
        // The first add's undo was the one dropped.
        assert_eq!(tag_ids(&data), ["t0"]);
    }

    #[test]
    fn empty_is_none() {
        let (mut data, mut tax) = fixture();
        let snapshot = data.clone();
        let mut h = History::new();
        assert_eq!(h.undo(&mut data, &mut tax), Ok(None));
        assert_eq!(h.redo(&mut data, &mut tax), Ok(None));
        assert_eq!(data, snapshot);
    }

    #[test]
    fn failed_undo_keeps_entry() {
        let (mut data, mut tax) = fixture();
        let mut h = History::new();
        add_tag(&mut h, &mut data, &mut tax, "a");
        data.references.retain(|r| r.id != "r1");
        let snapshot = data.clone();
        assert_eq!(
            h.undo(&mut data, &mut tax),
            Err(EditError::UnknownReference("r1".into()))
        );
        assert!(h.can_undo() && !h.can_redo());
        assert_eq!(data, snapshot);
    }
}
