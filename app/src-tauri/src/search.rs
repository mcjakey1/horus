//! Idea search (SPEC §5a option A): words in, techniques and the artist's own references out.

use crate::model::LibraryData;
use crate::taxonomy::Taxonomy;
use serde::Serialize;
use unicode_normalization::UnicodeNormalization;

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
/// Shorter queries (after `normalise`) return nothing: one letter matches half the library.
pub const MIN_QUERY_CHARS: usize = 2;

/// NFC, lowercase, every run of non-alphanumeric characters to one space, trimmed.
pub fn normalise(s: &str) -> String {
    let s = s.nfc().collect::<String>().to_lowercase();
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// `phrase` appears in `hay` as whole words. Both are already normalised.
fn has_phrase(hay: &str, phrase: &str) -> bool {
    !phrase.is_empty() && format!(" {hay} ").contains(&format!(" {phrase} "))
}

/// Idea search, run on every keystroke. The query and every field are `normalise`d first.
///
/// A technique matches when its name or a synonym contains the query, or the query contains
/// it as whole words ("chiaroscuro lighting"), or every query word longer than 3 characters
/// is a whole word of its description. A query containing an operation's name or plain label
/// as whole words pulls in all of that operation's techniques. A reference matches when its
/// title, its note, or the `why` of any link touching it contains the query.
///
/// One hit per technique. Its `operation_id` is the matched operation, if the query
/// matched one. Otherwise it is the operation the library tags it under most, and failing
/// that, the first operation it sits under in taxonomy order. Techniques are ranked by how
/// many references are tagged with them; ties keep taxonomy order.
pub fn search(tax: &Taxonomy, data: &LibraryData, q: &str) -> Vec<Hit> {
    let q = normalise(q);
    if q.chars().count() < MIN_QUERY_CHARS {
        return vec![];
    }
    let has = |s: &str| normalise(s).contains(&q);
    let field = |s: &str| {
        let s = normalise(s);
        s.contains(&q) || has_phrase(&q, &s)
    };
    let words: Vec<&str> = q.split(' ').filter(|w| w.chars().count() > 3).collect();
    let op_hits: Vec<&str> = tax
        .operations
        .iter()
        .filter(|o| {
            has_phrase(&q, &normalise(&o.name)) || has_phrase(&q, &normalise(&o.plain_label))
        })
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
        let text_match = field(&t.name)
            || t.synonyms.iter().any(|s| field(s))
            || (!words.is_empty() && {
                let d = normalise(&t.description);
                words.iter().all(|w| has_phrase(&d, w))
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

    fn empty() -> LibraryData {
        LibraryData {
            version: 1,
            references: vec![],
            links: vec![],
            boards: vec![],
        }
    }

    fn refs_lib(refs: Vec<Reference>) -> LibraryData {
        LibraryData {
            references: refs,
            ..empty()
        }
    }

    fn ref_ids(hits: &[Hit]) -> Vec<&str> {
        hits.iter()
            .filter_map(|h| match h {
                Hit::Reference { id } => Some(id.as_str()),
                Hit::Technique { .. } => None,
            })
            .collect()
    }

    fn op_of<'a>(hits: &'a [Hit], tech: &str) -> Option<&'a str> {
        hits.iter().find_map(|h| match h {
            Hit::Technique {
                id, operation_id, ..
            } if id == tech => Some(operation_id.as_str()),
            _ => None,
        })
    }

    #[test]
    fn operation_label_needs_whole_words() {
        let tax = seed();
        let hits = search(&tax, &library(), "lead the eye");
        assert_eq!(
            technique_ids(&hits),
            [
                "chiaroscuro",
                "good-continuation",
                "size-hierarchy",
                "temporal-synthesis",
                "leading-lines",
                "gaze-cue",
                "body-vector",
                "reading-path"
            ],
            "{hits:?}"
        );
        assert!(
            technique_ids(&hits)
                .iter()
                .all(|t| op_of(&hits, t) == Some("sequence"))
        );

        let hits = search(&tax, &library(), "make it stand out");
        assert_eq!(
            technique_ids(&hits),
            [
                "chiaroscuro",
                "pop-out",
                "saturation-blocking",
                "simultaneous-contrast",
                "warm-and-cool-split",
                "semantic-contrast",
                "face-schema",
                "complementary-pairing"
            ],
            "{hits:?}"
        );
        assert!(
            technique_ids(&hits)
                .iter()
                .all(|t| op_of(&hits, t) == Some("differentiate"))
        );

        // "out" is not the whole label "stand out": text matches only, so the tagged
        // Differentiate technique Chiaroscuro (no "out" in its text) is absent
        let hits = search(&tax, &library(), "out");
        assert_eq!(
            technique_ids(&hits),
            [
                "pop-out",
                "scale-disparity",
                "contextual-metaphor",
                "rim-light",
                "silhouette",
                "pattern-break",
                "crop-at-the-edge",
                "set-apart"
            ],
            "{hits:?}"
        );
    }

    #[test]
    fn min_query_length() {
        let lib = refs_lib(vec![reference("r1", "Abbey", vec![])]);
        assert_eq!(search(&seed(), &lib, "a"), vec![]);
        assert_eq!(search(&seed(), &lib, " a! "), vec![]);
        assert_eq!(ref_ids(&search(&seed(), &lib, "ab")), ["r1"]);
    }

    #[test]
    fn custom_operation_label() {
        let mut tax = seed();
        tax.operations.push(
            serde_json::from_value(serde_json::json!({"id": "provoke", "name": "Provoke",
                "plainLabel": "Make it sting", "color": null, "icon": "x", "description": "x"}))
            .unwrap(),
        );
        tax.branches.push(
            serde_json::from_value(serde_json::json!({"id": "provoke.feature",
                "operationId": "provoke", "domainId": "feature"}))
            .unwrap(),
        );
        tax.techniques.push(
            serde_json::from_value(serde_json::json!({"id": "barb", "name": "Barb", "icon": "x",
                "description": "x", "synonyms": [], "citation": null, "examples": [], "custom": true}))
            .unwrap(),
        );
        tax.branch_techniques.push(
            serde_json::from_value(serde_json::json!({"branchId": "provoke.feature",
                "techniqueId": "barb", "source": "user", "rationale": "x"}))
            .unwrap(),
        );
        let hits = search(&tax, &library(), "make it sting");
        assert_eq!(op_of(&hits, "barb"), Some("provoke"), "{hits:?}");

        let d = tax
            .operations
            .iter_mut()
            .find(|o| o.id == "differentiate")
            .unwrap();
        d.plain_label = "Pop".into();
        let hits = search(&tax, &library(), "stand out");
        assert_eq!(technique_ids(&hits), Vec::<&str>::new(), "{hits:?}");
        let hits = search(&tax, &library(), "pop");
        assert_eq!(
            op_of(&hits, "chiaroscuro"),
            Some("differentiate"),
            "{hits:?}"
        );
    }

    #[test]
    fn punctuation_stripped() {
        for q in ["moody!", "Moody,"] {
            assert!(
                technique_ids(&search(&seed(), &library(), q)).contains(&"chiaroscuro"),
                "{q}"
            );
        }
        assert!(technique_ids(&search(&seed(), &library(), "pop out")).contains(&"pop-out"));
    }

    #[test]
    fn query_contains_name() {
        let hits = search(&seed(), &library(), "chiaroscuro lighting");
        assert!(technique_ids(&hits).contains(&"chiaroscuro"), "{hits:?}");
        // a synonym ("eyes") inside a longer word is not a match
        let hits = search(&seed(), &library(), "eyesore");
        assert!(!technique_ids(&hits).contains(&"face-schema"), "{hits:?}");
    }

    #[test]
    fn description_words_over_3() {
        let finds =
            |q| technique_ids(&search(&seed(), &library(), q)).contains(&"isolation-in-void");
        assert!(finds("the empty space"));
        assert!(!finds("vast space"));
    }

    #[test]
    fn nfc_both_sides() {
        let lib = refs_lib(vec![reference("r1", "E\u{301}tude", vec![])]);
        for q in ["\u{c9}tude", "\u{e9}tude"] {
            assert_eq!(ref_ids(&search(&seed(), &lib, q)), ["r1"], "{q:?}");
        }
    }

    #[test]
    fn note_and_title_match() {
        let mut noted = reference("r1", "Untitled", vec![]);
        noted.note = Some("Seen at the flea-market".into());
        let lib = refs_lib(vec![noted, reference("r2", "Lighthouse, Brest", vec![])]);
        assert_eq!(ref_ids(&search(&seed(), &lib, "flea market")), ["r1"]);
        assert_eq!(ref_ids(&search(&seed(), &lib, "lighthouse brest")), ["r2"]);
    }

    #[test]
    fn reference_cap_is_4() {
        let lib = refs_lib(
            (1..=6)
                .map(|i| reference(&format!("r{i}"), &format!("harbour {i}"), vec![]))
                .collect(),
        );
        assert_eq!(
            ref_ids(&search(&seed(), &lib, "harbour")),
            ["r1", "r2", "r3", "r4"]
        );
    }

    #[test]
    fn operation_id_rungs() {
        let tax = seed();
        // 1. the matched operation wins, even over the library's tags (r1 tags Differentiate)
        assert_eq!(
            op_of(&search(&tax, &library(), "lead the eye"), "chiaroscuro"),
            Some("sequence")
        );
        // 2. no operation matched: the operation the library tags it under most
        let seq = || tag("sequence", "chiaroscuro", "sequence.feature");
        let lib = refs_lib(vec![
            reference("r1", "a", vec![seq()]),
            reference("r2", "b", vec![seq()]),
            reference(
                "r3",
                "c",
                vec![tag("differentiate", "chiaroscuro", "differentiate.feature")],
            ),
        ]);
        assert_eq!(
            op_of(&search(&tax, &lib, "moody"), "chiaroscuro"),
            Some("sequence")
        );
        // 3. untagged: the first operation it sits under, in taxonomy order
        assert_eq!(
            op_of(&search(&tax, &empty(), "moody"), "chiaroscuro"),
            Some("differentiate")
        );
    }

    /// The same cases as `tagging/model.test.ts` runs through `matchesQuery`, so the picker
    /// filter and this search agree. Extra fixture techniques sit under `differentiate.feature`.
    #[test]
    fn shared_match_cases() {
        let file: serde_json::Value =
            serde_json::from_str(include_str!("../../src/tagging/match-cases.json")).unwrap();
        let mut tax = seed();
        for t in file["extraTechniques"].as_array().unwrap() {
            let t: crate::taxonomy::Technique = serde_json::from_value(t.clone()).unwrap();
            tax.branch_techniques.push(
                serde_json::from_value(serde_json::json!({"branchId": "differentiate.feature",
                    "techniqueId": t.id, "source": "user", "rationale": "fixture"}))
                .unwrap(),
            );
            tax.techniques.push(t);
        }
        for c in file["cases"].as_array().unwrap() {
            let (q, id) = (c["q"].as_str().unwrap(), c["technique"].as_str().unwrap());
            let hits = search(&tax, &empty(), q);
            assert_eq!(
                technique_ids(&hits).contains(&id),
                c["match"].as_bool().unwrap(),
                "{q:?} -> {id}"
            );
        }
    }
}
