//! Idea search (SPEC §5a option A): words in, techniques and the artist's own references out.

use crate::model::LibraryData;
use crate::taxonomy::Taxonomy;
use serde::Serialize;

/// Over IPC: `{"kind":"technique","id","operationId","count"}` or `{"kind":"reference","id"}`.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Hit {
    Technique {
        id: String,
        operation_id: String,
        count: usize,
    },
    Reference {
        id: String,
    },
}

const MAX_TECHNIQUES: usize = 8;
const MAX_REFERENCES: usize = 4;

/// Case-insensitive search, mirroring `prototype/app.js` `searchTechniques`.
///
/// A technique matches on its name, a synonym (either one containing the other), or every
/// query word longer than 3 characters appearing in its description. A match on an
/// operation's name or plain label pulls in all of that operation's techniques. A reference
/// matches on its title, its note, or the `why` of any link touching it.
///
/// One hit per technique. Its `operation_id` is the matched operation, if the query
/// matched one. Otherwise it is the operation the library tags it under most, and failing
/// that, the first operation it sits under in taxonomy order. Techniques are ranked by how
/// many references are tagged with them; ties keep taxonomy order.
pub fn search(tax: &Taxonomy, data: &LibraryData, q: &str) -> Vec<Hit> {
    let q = q.trim().to_lowercase();
    if q.is_empty() {
        return vec![];
    }
    let has = |s: &str| s.to_lowercase().contains(&q);
    let words: Vec<&str> = q
        .split_whitespace()
        .filter(|w| w.chars().count() > 3)
        .collect();
    let op_hits: Vec<&str> = tax
        .operations
        .iter()
        .filter(|o| has(&o.name) || has(&o.plain_label))
        .map(|o| o.id.as_str())
        .collect();

    let mut techs: Vec<(usize, Hit)> = Vec::new();
    for t in &tax.techniques {
        // operations this technique sits under, in taxonomy branch order
        let mut ops: Vec<&str> = Vec::new();
        for b in &tax.branches {
            let linked = tax
                .branch_techniques
                .iter()
                .any(|l| l.branch_id == b.id && l.technique_id == t.id);
            if linked && !ops.contains(&b.operation_id.as_str()) {
                ops.push(&b.operation_id);
            }
        }
        // ponytail: a technique under no branch can't be tagged, so it isn't offered
        if ops.is_empty() {
            continue;
        }
        let op_match = ops.iter().find(|o| op_hits.contains(o)).copied();
        let text_match = has(&t.name)
            || t.synonyms.iter().any(|s| {
                let s = s.to_lowercase();
                !s.is_empty() && (s.contains(&q) || q.contains(&s))
            })
            || (!words.is_empty() && {
                let d = t.description.to_lowercase();
                words.iter().all(|w| d.contains(w))
            });
        if op_match.is_none() && !text_match {
            continue;
        }

        let tagged = |g: &crate::model::Tag| g.technique_id.as_deref() == Some(t.id.as_str());
        let count = data
            .references
            .iter()
            .filter(|r| r.tags.iter().any(tagged))
            .count();
        let operation_id = op_match.unwrap_or_else(|| {
            let uses = |op: &str| {
                data.references
                    .iter()
                    .flat_map(|r| &r.tags)
                    .filter(|g| tagged(g) && g.operation_id == op)
                    .count()
            };
            // first operation with the strictly highest tag count; ops[0] if none are tagged
            ops.iter().fold(
                ops[0],
                |best, &op| if uses(op) > uses(best) { op } else { best },
            )
        });
        techs.push((
            count,
            Hit::Technique {
                id: t.id.clone(),
                operation_id: operation_id.to_string(),
                count,
            },
        ));
    }
    techs.sort_by_key(|t| std::cmp::Reverse(t.0)); // stable: ties keep taxonomy order

    let refs = data
        .references
        .iter()
        .filter(|r| {
            has(&r.title)
                || r.note.as_deref().is_some_and(has)
                || data
                    .links
                    .iter()
                    .any(|l| (l.from_ref == r.id || l.to_ref == r.id) && has(&l.why))
        })
        .take(MAX_REFERENCES)
        .map(|r| Hit::Reference { id: r.id.clone() });

    techs
        .into_iter()
        .take(MAX_TECHNIQUES)
        .map(|(_, h)| h)
        .chain(refs)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Link, Reference, Tag};
    use std::path::Path;

    fn seed() -> Taxonomy {
        Taxonomy::load(&Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/taxonomy.json"))
            .expect("seed taxonomy loads")
    }

    fn reference(id: &str, title: &str, tags: Vec<Tag>) -> Reference {
        Reference {
            id: id.into(),
            title: title.into(),
            creator: None,
            year: None,
            source_url: None,
            credit: None,
            note: None,
            file: format!("{id}.jpg"),
            hash: id.into(),
            width: 100,
            height: 100,
            added_at: "2026-11-25T00:00:00Z".into(),
            tags,
        }
    }

    fn tag(op: &str, tech: &str, branch: &str) -> Tag {
        Tag {
            id: format!("{op}-{tech}"),
            operation_id: op.into(),
            technique_id: Some(tech.into()),
            branch_id: Some(branch.into()),
            region: None,
            suggested: false,
        }
    }

    fn library() -> LibraryData {
        LibraryData {
            version: 1,
            references: vec![
                reference(
                    "r1",
                    "Harbour at dusk",
                    vec![tag("differentiate", "chiaroscuro", "differentiate.feature")],
                ),
                reference(
                    "r2",
                    "Market crowd",
                    vec![tag("group", "proximity-clustering", "group.grouping")],
                ),
                reference("r3", "Untitled study", vec![]),
            ],
            links: vec![Link {
                id: "l1".into(),
                from_ref: "r2".into(),
                to_ref: "r3".into(),
                why: "both use a zigzag staircase".into(),
            }],
            boards: vec![],
        }
    }

    fn technique_ids(hits: &[Hit]) -> Vec<&str> {
        hits.iter()
            .filter_map(|h| match h {
                Hit::Technique { id, .. } => Some(id.as_str()),
                Hit::Reference { .. } => None,
            })
            .collect()
    }

    #[test]
    fn moody_finds_chiaroscuro() {
        let hits = search(&seed(), &library(), "Moody");
        assert!(technique_ids(&hits).contains(&"chiaroscuro"), "{hits:?}");
        assert!(hits.contains(&Hit::Technique {
            id: "chiaroscuro".into(),
            operation_id: "differentiate".into(),
            count: 1,
        }));
    }

    #[test]
    fn plain_label_expands_operation() {
        let tax = seed();
        let hits = search(&tax, &library(), "stand out");
        let techs: Vec<_> = hits
            .iter()
            .filter_map(|h| match h {
                Hit::Technique { operation_id, .. } => Some(operation_id.as_str()),
                Hit::Reference { .. } => None,
            })
            .collect();
        assert_eq!(techs.len(), 8, "{hits:?}");
        assert!(techs.iter().all(|op| *op == "differentiate"), "{hits:?}");
        // the one tagged Differentiate technique ranks first
        assert_eq!(technique_ids(&hits)[0], "chiaroscuro");
        for id in technique_ids(&hits) {
            assert!(!tax.branches_for("differentiate", id).is_empty(), "{id}");
        }
    }

    #[test]
    fn link_note_finds_reference() {
        let hits = search(&seed(), &library(), "zigzag");
        assert_eq!(
            hits,
            vec![
                Hit::Reference { id: "r2".into() },
                Hit::Reference { id: "r3".into() }
            ]
        );
    }

    #[test]
    fn hit_json_is_tagged_camel_case() {
        let t = Hit::Technique {
            id: "chiaroscuro".into(),
            operation_id: "differentiate".into(),
            count: 2,
        };
        assert_eq!(
            serde_json::to_value(&t).unwrap(),
            serde_json::json!({"kind": "technique", "id": "chiaroscuro", "operationId": "differentiate", "count": 2})
        );
        assert_eq!(
            serde_json::to_value(Hit::Reference { id: "r1".into() }).unwrap(),
            serde_json::json!({"kind": "reference", "id": "r1"})
        );
    }

    #[test]
    fn blank_query_is_empty() {
        assert_eq!(search(&seed(), &library(), "   "), vec![]);
    }
}
