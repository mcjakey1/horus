//! "Related" scoring (SPEC §4): cosine similarity over one entry per technique
//! (weighted by smoothed IDF) and one per operation × domain branch (BRANCH_W).
//! Operation-only (partial) tags add nothing. Mirrors prototype/app.js vec()/score().

use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::Serialize;

use crate::model::{LibraryData, Reference};

pub const BRANCH_W: f64 = 0.3;
pub const MIN_SCORE: f64 = 0.05;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Scored {
    pub id: String,
    pub score: f64,
    pub shared_techniques: Vec<String>,
    pub shared_branches: Vec<String>,
}

pub struct Index {
    idf: HashMap<String, f64>,
}

/// Vector key: a technique entry or a branch entry.
#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum Key<'a> {
    Technique(&'a str),
    Branch(&'a str),
}

impl Index {
    /// N = references with ≥1 technique tag; idf = ln(1 + N/df), raw and unscaled.
    pub fn build(data: &LibraryData) -> Index {
        let mut df: HashMap<&str, usize> = HashMap::new();
        // N = references with at least one technique tag (SPEC §4, decided 2026-11-25).
        let mut n = 0usize;
        for r in &data.references {
            let techs: BTreeSet<&str> = r
                .tags
                .iter()
                .filter_map(|t| t.technique_id.as_deref())
                .collect();
            if techs.is_empty() {
                continue;
            }
            n += 1;
            for t in techs {
                *df.entry(t).or_default() += 1;
            }
        }
        let idf = df
            .into_iter()
            .map(|(t, d)| (t.to_string(), (1.0 + n as f64 / d as f64).ln()))
            .collect();
        Index { idf }
    }

    /// One entry per technique and per branch; region repeats collapse; partial tags add nothing.
    fn vector<'a>(&self, r: &'a Reference) -> BTreeMap<Key<'a>, f64> {
        let mut v = BTreeMap::new();
        for t in &r.tags {
            if let Some(tech) = t.technique_id.as_deref() {
                v.insert(
                    Key::Technique(tech),
                    self.idf.get(tech).copied().unwrap_or(0.0),
                );
                if let Some(b) = t.branch_id.as_deref() {
                    v.insert(Key::Branch(b), BRANCH_W);
                }
            }
        }
        v
    }

    pub fn score(&self, a: &Reference, b: &Reference) -> Scored {
        let (va, vb) = (self.vector(a), self.vector(b));
        let norm = |v: &BTreeMap<Key, f64>| v.values().map(|w| w * w).sum::<f64>().sqrt();
        let (na, nb) = (norm(&va), norm(&vb));
        let mut out = Scored {
            id: b.id.clone(),
            score: 0.0,
            shared_techniques: vec![],
            shared_branches: vec![],
        };
        if na == 0.0 || nb == 0.0 {
            return out; // zero vector: score 0, never NaN
        }
        let mut dot = 0.0;
        for (k, w) in &va {
            if let Some(w2) = vb.get(k) {
                dot += w * w2;
                match k {
                    Key::Technique(t) => out.shared_techniques.push(t.to_string()),
                    Key::Branch(br) => out.shared_branches.push(br.to_string()),
                }
            }
        }
        out.score = dot / (na * nb);
        out
    }

    /// Scores ≥ MIN_SCORE, highest first, excluding `id` itself. Unknown id → empty.
    pub fn related(&self, data: &LibraryData, id: &str) -> Vec<Scored> {
        let Some(me) = data.references.iter().find(|r| r.id == id) else {
            return vec![];
        };
        let mut out: Vec<Scored> = data
            .references
            .iter()
            .filter(|r| r.id != id)
            .map(|r| self.score(me, r))
            .filter(|s| s.score >= MIN_SCORE)
            .collect();
        out.sort_by(|x, y| y.score.total_cmp(&x.score));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Region, Tag};

    fn tech(t: &str, b: &str) -> Tag {
        Tag {
            id: format!("{t}-{b}"),
            operation_id: "op".into(),
            technique_id: Some(t.into()),
            branch_id: Some(b.into()),
            region: None,
            suggested: false,
        }
    }

    fn partial() -> Tag {
        Tag {
            id: "p".into(),
            operation_id: "op".into(),
            technique_id: None,
            branch_id: None,
            region: None,
            suggested: false,
        }
    }

    fn r(id: &str, tags: Vec<Tag>) -> Reference {
        Reference {
            id: id.into(),
            title: id.into(),
            creator: None,
            year: None,
            source_url: None,
            credit: None,
            note: None,
            file: format!("{id}.jpg"),
            hash: id.into(),
            width: 1,
            height: 1,
            added_at: "2026-11-25T00:00:00Z".into(),
            tags,
        }
    }

    fn lib(refs: Vec<Reference>) -> LibraryData {
        LibraryData {
            version: 1,
            references: refs,
            links: vec![],
            boards: vec![],
        }
    }

    fn find<'a>(d: &'a LibraryData, id: &str) -> &'a Reference {
        d.references.iter().find(|r| r.id == id).unwrap()
    }

    #[test]
    fn identical_sets_score_one() {
        let tags = vec![tech("t1", "b1"), tech("t2", "b2")];
        let d = lib(vec![
            r("a", tags.clone()),
            r("b", tags),
            r("c", vec![tech("t3", "b3")]),
        ]);
        let s = Index::build(&d).score(find(&d, "a"), find(&d, "b"));
        assert!((s.score - 1.0).abs() < 1e-9, "{}", s.score);
    }

    #[test]
    fn one_vs_six_is_about_0_408() {
        // C2..C6 make df = 2 for every t1..t6 (N = 7), so all idf are equal.
        let mut refs = vec![
            r("a", vec![tech("t1", "b1")]),
            r(
                "b",
                (1..=6)
                    .map(|i| tech(&format!("t{i}"), &format!("b{i}")))
                    .collect(),
            ),
        ];
        refs.extend((2..=6).map(|i| {
            r(
                &format!("c{i}"),
                vec![tech(&format!("t{i}"), &format!("b{i}"))],
            )
        }));
        let d = lib(refs);
        let s = Index::build(&d).score(find(&d, "a"), find(&d, "b"));
        assert!((s.score - 0.408).abs() < 0.001, "{}", s.score);
    }

    #[test]
    fn same_branch_different_technique_is_partial() {
        let d = lib(vec![
            r("a", vec![tech("t1", "b1")]),
            r("b", vec![tech("t2", "b1")]),
        ]);
        let s = Index::build(&d).score(find(&d, "a"), find(&d, "b"));
        assert!(s.score > 0.0 && s.score < 0.5, "{}", s.score);
        assert_eq!(s.shared_branches, vec!["b1".to_string()]);
        assert!(s.shared_techniques.is_empty());
    }

    #[test]
    fn partial_tags_count_zero() {
        let d = lib(vec![r("a", vec![partial()]), r("b", vec![partial()])]);
        let s = Index::build(&d).score(find(&d, "a"), find(&d, "b"));
        assert_eq!(s.score, 0.0);
    }

    #[test]
    fn regions_collapse() {
        let region = |x| {
            let mut t = tech("t1", "b1");
            t.region = Some(Region {
                x,
                y: 0.0,
                w: 0.1,
                h: 0.1,
            });
            t
        };
        let d = lib(vec![
            r(
                "a",
                vec![region(0.1), region(0.2), region(0.3), tech("t2", "b2")],
            ),
            r("a1", vec![tech("t1", "b1"), tech("t2", "b2")]),
            r("b", vec![tech("t1", "b1"), tech("t3", "b3")]),
        ]);
        let idx = Index::build(&d);
        let many = idx.score(find(&d, "a"), find(&d, "b")).score;
        let one = idx.score(find(&d, "a1"), find(&d, "b")).score;
        assert!(many > 0.0);
        assert!((many - one).abs() < 1e-12, "{many} vs {one}");
    }

    #[test]
    fn empty_library_related_is_empty() {
        let d = lib(vec![r("a", vec![]), r("b", vec![])]);
        assert!(Index::build(&d).related(&d, "a").is_empty());
    }

    #[test]
    fn rare_beats_common() {
        // t_common on 9 of 10 refs, t_rare on 2 (x, y). Pair (x, y) shares only t_rare;
        // pair (p, q) shares only t_common. Every ref has a unique filler technique.
        let mut refs = vec![
            r("x", vec![tech("t_rare", "b1"), tech("u_x", "bx")]),
            r(
                "y",
                vec![
                    tech("t_rare", "b1"),
                    tech("t_common", "b2"),
                    tech("u_y", "by"),
                ],
            ),
        ];
        // y also carries t_common, but no other ref in the (x, y) pair does.
        for i in 0..8 {
            refs.push(r(
                &format!("c{i}"),
                vec![
                    tech("t_common", "b2"),
                    tech(&format!("u{i}"), &format!("bu{i}")),
                ],
            ));
        }
        let d = lib(refs);
        let idx = Index::build(&d);
        let rare = idx.score(find(&d, "x"), find(&d, "y"));
        let common = idx.score(find(&d, "c0"), find(&d, "c1"));
        assert_eq!(rare.shared_techniques, vec!["t_rare".to_string()]);
        assert_eq!(common.shared_techniques, vec!["t_common".to_string()]);
        assert!(
            rare.score > common.score,
            "{} vs {}",
            rare.score,
            common.score
        );
    }

    #[test]
    fn related_excludes_self_sorts_desc_and_filters() {
        let d = lib(vec![
            r("a", vec![tech("t1", "b1"), tech("t2", "b2")]),
            r("b", vec![tech("t1", "b1"), tech("t2", "b2")]),
            r("c", vec![tech("t1", "b1"), tech("t9", "b9")]),
            r("z", vec![tech("t8", "b8")]),
        ]);
        let out = Index::build(&d).related(&d, "a");
        let ids: Vec<_> = out.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["b", "c"]);
        assert!(out.iter().all(|s| s.score >= MIN_SCORE));
    }
}
