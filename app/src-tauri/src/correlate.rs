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

/// A Galaxy edge: one per unordered pair, with `a < b` in string order.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub a: String,
    pub b: String,
    pub score: f64,
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

    /// Galaxy edges: the union of every reference's top `k` related, one edge per pair.
    /// Each reference keeps its own top `k` with score ≥ MIN_SCORE, ranked by
    /// (score desc, other id asc) so ties at the k boundary are deterministic.
    /// Candidates come from an inverted index (technique → references), so only pairs that
    /// share a technique are scored. Pairs that share only a branch are skipped (c5): they
    /// score low, and scanning them would bring back O(N²).
    /// Each vector and its norm are built once; the cosine is `score`'s maths.
    pub fn graph_edges(&self, data: &LibraryData, k: usize) -> Vec<Edge> {
        let refs = &data.references;
        let vecs: Vec<_> = refs
            .iter()
            .map(|r| {
                let v = self.vector(r);
                let n = v.values().map(|w| w * w).sum::<f64>().sqrt();
                (v, n)
            })
            .collect();
        let mut postings: HashMap<&str, Vec<usize>> = HashMap::new();
        for (i, (v, _)) in vecs.iter().enumerate() {
            for key in v.keys() {
                if let Key::Technique(t) = key {
                    postings.entry(t).or_default().push(i);
                }
            }
        }
        let mut out: BTreeMap<(&str, &str), f64> = BTreeMap::new();
        for (i, (va, na)) in vecs.iter().enumerate() {
            let me = refs[i].id.as_str();
            let cands: BTreeSet<usize> = va
                .keys()
                .filter_map(|key| match key {
                    Key::Technique(t) => postings.get(t),
                    Key::Branch(_) => None,
                })
                .flatten()
                .copied()
                .collect();
            let mut top: Vec<(f64, &str)> = cands
                .into_iter()
                .filter(|&j| refs[j].id != me)
                .filter_map(|j| {
                    let (vb, nb) = &vecs[j];
                    if *na == 0.0 || *nb == 0.0 {
                        return None; // zero vector: score 0, never NaN
                    }
                    let dot: f64 = va
                        .iter()
                        .filter_map(|(key, w)| vb.get(key).map(|w2| w * w2))
                        .sum();
                    let s = dot / (na * nb);
                    (s >= MIN_SCORE).then_some((s, refs[j].id.as_str()))
                })
                .collect();
            top.sort_by(|x, y| y.0.total_cmp(&x.0).then_with(|| x.1.cmp(y.1)));
            for (s, other) in top.into_iter().take(k) {
                out.insert((me.min(other), me.max(other)), s);
            }
        }
        out.into_iter()
            .map(|((a, b), score)| Edge {
                a: a.to_string(),
                b: b.to_string(),
                score,
            })
            .collect()
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

    /// xorshift64: the test's only randomness (no `rand` crate).
    struct Rng(u64);
    impl Rng {
        fn next(&mut self, n: u64) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0 % n
        }
    }

    /// Per reference: every other reference sharing a technique, scored with `Index::score`,
    /// ranked (score desc, id asc), the top k ≥ MIN_SCORE; the union keyed (min, max).
    fn brute(d: &LibraryData, k: usize) -> BTreeMap<(String, String), f64> {
        let idx = Index::build(d);
        let techs = |r: &Reference| -> BTreeSet<String> {
            r.tags
                .iter()
                .filter_map(|t| t.technique_id.clone())
                .collect()
        };
        let mut out = BTreeMap::new();
        for a in &d.references {
            let ta = techs(a);
            let mut c: Vec<Scored> = d
                .references
                .iter()
                .filter(|b| b.id != a.id && !techs(b).is_disjoint(&ta))
                .map(|b| idx.score(a, b))
                .filter(|s| s.score >= MIN_SCORE)
                .collect();
            c.sort_by(|x, y| y.score.total_cmp(&x.score).then_with(|| x.id.cmp(&y.id)));
            for s in c.into_iter().take(k) {
                let key = if a.id < s.id {
                    (a.id.clone(), s.id)
                } else {
                    (s.id, a.id.clone())
                };
                out.insert(key, s.score);
            }
        }
        out
    }

    fn edges(d: &LibraryData, k: usize) -> Vec<Edge> {
        Index::build(d).graph_edges(d, k)
    }

    fn random_lib() -> LibraryData {
        let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
        let refs = (0..200)
            .map(|i| {
                let tags = (0..1 + rng.next(4))
                    .map(|_| match rng.next(10) {
                        0 => partial(),
                        _ => tech(&format!("t{}", rng.next(30)), &format!("b{}", rng.next(6))),
                    })
                    .collect();
                // Permuted ids (37 is coprime with 200): id order is not index order, so the
                // (score desc, id asc) tie-break is exercised.
                r(&format!("r{:03}", (i * 37) % 200), tags)
            })
            .collect();
        lib(refs)
    }

    #[test]
    fn graph_edges_match_bruteforce() {
        let d = random_lib();
        let want = brute(&d, 8);
        let got = edges(&d, 8);
        assert!(!want.is_empty());
        let got_keys: BTreeSet<_> = got.iter().map(|e| (e.a.clone(), e.b.clone())).collect();
        let want_keys: BTreeSet<_> = want.keys().cloned().collect();
        assert_eq!(got_keys, want_keys);
        for e in &got {
            let w = want[&(e.a.clone(), e.b.clone())];
            assert!((e.score - w).abs() < 1e-12, "{e:?} vs {w}");
        }
    }

    #[test]
    fn graph_edges_no_self_no_dupes() {
        let got = edges(&random_lib(), 8);
        assert!(!got.is_empty());
        let mut seen = BTreeSet::new();
        for e in &got {
            assert!(e.a < e.b, "{e:?}");
            assert!(seen.insert((e.a.clone(), e.b.clone())), "dupe {e:?}");
        }
    }

    #[test]
    fn graph_edges_respects_k_and_min() {
        // The hub shares a distinct rare technique with each leaf; leaf i also carries i
        // unique fillers, so the hub ranks the leaves l00 > l01 > ... and keeps l00..l07.
        let hub = r(
            "hub",
            (0..20)
                .map(|i| tech(&format!("x{i}"), &format!("bx{i}")))
                .collect(),
        );
        let mut refs = vec![hub];
        for i in 0..20 {
            let mut tags = vec![tech(&format!("x{i}"), &format!("bx{i}"))];
            tags.extend((0..i).map(|j| tech(&format!("u{i}_{j}"), &format!("bu{i}_{j}"))));
            refs.push(r(&format!("l{i:02}"), tags));
        }
        let d = lib(refs);
        let got = edges(&d, 8);
        let idx = Index::build(&d);
        let hub_of = |e: &Edge| match (e.a.as_str(), e.b.as_str()) {
            ("hub", o) | (o, "hub") => Some(o.to_string()),
            _ => None,
        };
        let hub_edges: BTreeSet<String> = got.iter().filter_map(hub_of).collect();
        // The hub's own top 8 are all there.
        let mut ranked: Vec<Scored> = d.references[1..]
            .iter()
            .map(|l| idx.score(&d.references[0], l))
            .filter(|s| s.score >= MIN_SCORE)
            .collect();
        ranked.sort_by(|x, y| y.score.total_cmp(&x.score).then_with(|| x.id.cmp(&y.id)));
        assert!(ranked.len() > 8, "the star must overflow k");
        for s in &ranked[..8] {
            assert!(hub_edges.contains(&s.id), "{} missing", s.id);
        }
        // The union may add more hub edges, from the leaves' side, but only leaves above MIN_SCORE.
        assert_eq!(hub_edges.len(), ranked.len());
        assert!(got.iter().all(|e| e.score >= MIN_SCORE), "{got:?}");
        assert_eq!(
            got.len(),
            hub_edges.len(),
            "leaves share nothing with each other"
        );
    }

    #[test]
    fn graph_edges_empty_and_partial() {
        assert!(edges(&lib(vec![]), 8).is_empty());
        let d = lib(vec![
            r("a", vec![partial()]),
            r("b", vec![partial(), partial()]),
        ]);
        assert!(edges(&d, 8).is_empty());
    }

    /// A synthetic 2,500-reference library shaped like `scripts/make_perf_library.py`'s:
    /// 55 (technique, branch) links like the seed's branchTechniques (48 techniques, 18 branches),
    /// 1-4 distinct links per reference drawn Zipf (weight 1/rank). With `head`, link 0 is also
    /// put on ~85% of the references (the carry-in's head-heavy case).
    fn perf_lib(head: bool) -> LibraryData {
        const LINKS: usize = 55;
        let link = |i: usize| tech(&format!("t{}", i % 48), &format!("b{}", i % 18));
        let cum: Vec<f64> = (1..=LINKS)
            .scan(0.0, |s, r| {
                *s += 1.0 / r as f64;
                Some(*s)
            })
            .collect();
        let mut rng = Rng(0x2545_F491_4F6C_DD1D);
        let refs = (0..2500)
            .map(|i| {
                let mut picked = BTreeSet::new();
                if head && rng.next(100) < 85 {
                    picked.insert(0);
                }
                let want = picked.len() + 1 + rng.next(4) as usize;
                while picked.len() < want.min(4) {
                    let u = rng.next(1_000_000) as f64 / 1e6 * cum[LINKS - 1];
                    picked.insert(cum.iter().position(|&c| u < c).unwrap_or(LINKS - 1));
                }
                r(&format!("p{i:04}"), picked.into_iter().map(link).collect())
            })
            .collect();
        lib(refs)
    }

    /// Release only: `cargo test --release -- --ignored graph_edges_2500 --nocapture`.
    fn under_budget(d: &LibraryData, label: &str) {
        let t0 = std::time::Instant::now();
        let idx = Index::build(d);
        let built = t0.elapsed();
        let t1 = std::time::Instant::now();
        let got = idx.graph_edges(d, 8);
        let took = t1.elapsed();
        println!(
            "{label}: Index::build {built:?}, graph_edges {took:?}, {} edges",
            got.len()
        );
        assert!(!got.is_empty());
        assert!(
            took.as_secs_f64() < 1.5,
            "{label}: graph_edges took {took:?}"
        );
    }

    #[test]
    #[ignore]
    fn graph_edges_2500_under_budget() {
        under_budget(&perf_lib(false), "zipf");
    }

    #[test]
    #[ignore]
    fn graph_edges_2500_head_heavy_under_budget() {
        let d = perf_lib(true);
        let on_head = d
            .references
            .iter()
            .filter(|r| {
                r.tags
                    .iter()
                    .any(|t| t.technique_id.as_deref() == Some("t0"))
            })
            .count();
        assert!(on_head >= 2000, "head technique on only {on_head} of 2,500");
        under_budget(&d, "head-heavy");
    }

    #[test]
    fn graph_edges_skip_branch_only() {
        let d = lib(vec![
            r("a", vec![tech("t1", "b1")]),
            r("b", vec![tech("t2", "b1")]),
        ]);
        // The pair would pass MIN_SCORE on the shared branch alone: it is skipped by design (c5).
        let s = Index::build(&d).score(find(&d, "a"), find(&d, "b"));
        assert!(s.score >= MIN_SCORE, "{}", s.score);
        assert!(edges(&d, 8).is_empty());
    }
}
