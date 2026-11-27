//! `embeddings.bin` in the library folder, plus brute-force cosine top-k.
//!
//! File: magic `b"HRSE"`, u32 version = 1, `[u8; 32]` model_key (SHA-256 over the concatenated
//! pinned sha256 strings of all `spec.files`), u32 dim, u32 count, then
//! count × (`[u8; 32]` BLAKE3 image hash, dim × f32 LE). All integers LE. Written atomically.
//! A derived cache: anything that doesn't match exactly loads as empty (re-index), never a panic.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use super::model::ModelSpec;
use crate::library::write_atomic;

const MAGIC: &[u8; 4] = b"HRSE";
const VERSION: u32 = 1;
/// magic + version + model_key + dim + count
const HEADER: usize = 4 + 4 + 32 + 4 + 4;

pub struct EmbStore {
    by_hash: HashMap<[u8; 32], Vec<f32>>,
    model_key: [u8; 32],
    dim: usize,
}

pub fn embeddings_path(root: &Path) -> PathBuf {
    root.join("embeddings.bin")
}

/// SHA-256 over the concatenated pinned sha256 strings of all the model's files.
fn model_key(spec: &ModelSpec) -> [u8; 32] {
    let mut h = Sha256::new();
    for f in spec.files {
        h.update(f.sha256.as_bytes());
    }
    let mut key = [0; 32];
    key.copy_from_slice(&h.finalize());
    key
}

/// 64 lowercase hex characters (a BLAKE3 hash as Horus writes it), else `None`.
fn parse_hash(s: &str) -> Option<[u8; 32]> {
    let b = s.as_bytes();
    if b.len() != 64
        || !b
            .iter()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c))
    {
        return None;
    }
    let mut out = [0; 32];
    for (i, o) in out.iter_mut().enumerate() {
        *o = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).ok()?;
    }
    Some(out)
}

fn to_hex(k: &[u8; 32]) -> String {
    k.iter().map(|b| format!("{b:02x}")).collect()
}

fn u32_at(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}

/// The records, or `None` unless the file matches this model exactly and has no extra bytes.
fn parse(b: &[u8], key: &[u8; 32], dim: usize) -> Option<HashMap<[u8; 32], Vec<f32>>> {
    if b.len() < HEADER
        || &b[..4] != MAGIC
        || u32_at(b, 4) != VERSION
        || &b[8..40] != key
        || u32_at(b, 40) as usize != dim
    {
        return None;
    }
    let rec = 32 + 4 * dim;
    let need = (u32_at(b, 44) as usize)
        .checked_mul(rec)?
        .checked_add(HEADER)?;
    if b.len() != need {
        return None;
    }
    let records = b[HEADER..].chunks_exact(rec).map(|r| {
        let mut k = [0; 32];
        k.copy_from_slice(&r[..32]);
        let v = r[32..]
            .as_chunks::<4>()
            .0
            .iter()
            .map(|f| f32::from_le_bytes(*f))
            .collect();
        (k, v)
    });
    Some(records.collect())
}

impl EmbStore {
    /// Missing, corrupt, truncated or another model's file: empty. Never panics.
    pub fn load(root: &Path, spec: &ModelSpec) -> EmbStore {
        let model_key = model_key(spec);
        let by_hash = std::fs::read(embeddings_path(root))
            .ok()
            .and_then(|b| parse(&b, &model_key, spec.dim))
            .unwrap_or_default();
        EmbStore {
            by_hash,
            model_key,
            dim: spec.dim,
        }
    }

    pub fn save(&self, root: &Path) -> std::io::Result<()> {
        let mut b = Vec::with_capacity(HEADER + self.by_hash.len() * (32 + 4 * self.dim));
        b.extend_from_slice(MAGIC);
        b.extend_from_slice(&VERSION.to_le_bytes());
        b.extend_from_slice(&self.model_key);
        b.extend_from_slice(&(self.dim as u32).to_le_bytes());
        b.extend_from_slice(&(self.by_hash.len() as u32).to_le_bytes());
        for (k, v) in &self.by_hash {
            b.extend_from_slice(k);
            for x in v {
                b.extend_from_slice(&x.to_le_bytes());
            }
        }
        write_atomic(&embeddings_path(root), &b)
    }

    pub fn has(&self, hash: &str) -> bool {
        parse_hash(hash).is_some_and(|k| self.by_hash.contains_key(&k))
    }

    /// Ignores a hash Horus didn't write, or a vector of the wrong width.
    pub fn put(&mut self, hash: &str, v: Vec<f32>) {
        if let (Some(k), true) = (parse_hash(hash), v.len() == self.dim) {
            self.by_hash.insert(k, v);
        }
    }

    /// Drops hashes no longer in the library; returns how many were dropped.
    pub fn prune(&mut self, keep: &HashSet<String>) -> usize {
        let keep: HashSet<[u8; 32]> = keep.iter().filter_map(|h| parse_hash(h)).collect();
        let before = self.by_hash.len();
        self.by_hash.retain(|k, _| keep.contains(k));
        before - self.by_hash.len()
    }

    /// Up to `k` hashes scoring `>= min` against `q` (dot product of L2-normalised vectors),
    /// highest first, never `exclude`.
    // ponytail: brute force over every vector, fine at library sizes (2,500 × 768 is ~2M
    // multiply-adds); an ANN index only if a library grows by orders of magnitude.
    pub fn top_k(
        &self,
        q: &[f32],
        k: usize,
        min: f32,
        exclude: Option<&str>,
    ) -> Vec<(String, f32)> {
        if q.len() != self.dim {
            return vec![];
        }
        let exclude = exclude.and_then(parse_hash);
        let mut hits: Vec<(&[u8; 32], f32)> = self
            .by_hash
            .iter()
            .filter(|(h, _)| Some(**h) != exclude)
            .map(|(h, v)| (h, v.iter().zip(q).map(|(a, b)| a * b).sum::<f32>()))
            .filter(|(_, s)| *s >= min) // NaN never passes
            .collect();
        hits.sort_by(|a, b| b.1.total_cmp(&a.1));
        hits.truncate(k);
        hits.into_iter().map(|(h, s)| (to_hex(h), s)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::similar::model::SIGLIP_B16_Q8;
    use std::fs;

    fn h(c: char) -> String {
        std::iter::repeat_n(c, 64).collect()
    }

    fn unit(dim: usize, i: usize) -> Vec<f32> {
        let mut v = vec![0.0; dim];
        v[i] = 1.0;
        v
    }

    fn three() -> (tempfile::TempDir, EmbStore) {
        let dir = tempfile::tempdir().unwrap();
        let mut s = EmbStore::load(dir.path(), &SIGLIP_B16_Q8);
        let dim = SIGLIP_B16_Q8.dim;
        s.put(&h('a'), unit(dim, 0));
        s.put(&h('b'), (0..dim).map(|i| (i as f32 * 0.37).sin()).collect());
        s.put(&h('c'), unit(dim, 5));
        (dir, s)
    }

    #[test]
    fn roundtrip() {
        let (dir, s) = three();
        s.save(dir.path()).unwrap();
        let back = EmbStore::load(dir.path(), &SIGLIP_B16_Q8);
        assert_eq!(back.by_hash.len(), 3);
        for (k, v) in &s.by_hash {
            let w = &back.by_hash[k];
            assert!(v.iter().zip(w).all(|(a, b)| a.to_bits() == b.to_bits()));
        }
        assert!(back.has(&h('a')) && back.has(&h('b')) && back.has(&h('c')));
    }

    #[test]
    fn other_model_is_empty() {
        let (dir, mut s) = three();
        s.model_key = [7; 32];
        s.save(dir.path()).unwrap();
        let back = EmbStore::load(dir.path(), &SIGLIP_B16_Q8);
        assert!(back.by_hash.is_empty());
        assert!(!back.has(&h('a')));
    }

    #[test]
    fn missing_or_garbage_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(
            EmbStore::load(dir.path(), &SIGLIP_B16_Q8)
                .by_hash
                .is_empty()
        );
        fs::write(embeddings_path(dir.path()), b"not an embeddings file").unwrap();
        assert!(
            EmbStore::load(dir.path(), &SIGLIP_B16_Q8)
                .by_hash
                .is_empty()
        );
    }

    #[test]
    fn truncated_is_empty_not_panic() {
        let (dir, s) = three();
        s.save(dir.path()).unwrap();
        let path = embeddings_path(dir.path());
        let full = fs::read(&path).unwrap();
        // 50 cut points spread over the whole file, including inside the header.
        for i in 0..50 {
            let cut = (full.len() - 1) * i / 49;
            fs::write(&path, &full[..cut]).unwrap();
            assert!(
                EmbStore::load(dir.path(), &SIGLIP_B16_Q8)
                    .by_hash
                    .is_empty(),
                "cut {cut}"
            );
        }
        // A trailing extra byte is damage too.
        let mut long = full.clone();
        long.push(0);
        fs::write(&path, &long).unwrap();
        assert!(
            EmbStore::load(dir.path(), &SIGLIP_B16_Q8)
                .by_hash
                .is_empty()
        );
    }

    #[test]
    fn huge_count_is_empty_not_panic() {
        let (dir, s) = three();
        s.save(dir.path()).unwrap();
        let path = embeddings_path(dir.path());
        let mut bytes = fs::read(&path).unwrap();
        // count sits after magic (4), version (4), model_key (32) and dim (4).
        bytes[44..48].copy_from_slice(&u32::MAX.to_le_bytes());
        fs::write(&path, &bytes).unwrap();
        assert!(
            EmbStore::load(dir.path(), &SIGLIP_B16_Q8)
                .by_hash
                .is_empty()
        );
    }

    #[test]
    fn prune_drops_missing() {
        let (_dir, mut s) = three();
        let keep: HashSet<String> = [h('a'), h('c')].into();
        assert_eq!(s.prune(&keep), 1);
        assert!(!s.has(&h('b')));
        assert!(s.has(&h('a')) && s.has(&h('c')));
    }

    #[test]
    fn top_k_orders_filters_excludes() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = EmbStore::load(dir.path(), &SIGLIP_B16_Q8);
        let dim = SIGLIP_B16_Q8.dim;
        // Unit vectors in the (x0, x1) plane at known angles from q = x0.
        let at = |deg: f32| {
            let mut v = vec![0.0; dim];
            v[0] = deg.to_radians().cos();
            v[1] = deg.to_radians().sin();
            v
        };
        s.put(&h('0'), at(0.0)); // the query itself: cos 1.0
        s.put(&h('1'), at(10.0)); // 0.985
        s.put(&h('2'), at(40.0)); // 0.766
        s.put(&h('3'), at(60.0)); // 0.5
        s.put(&h('4'), at(85.0)); // 0.087, below min
        let hits = s.top_k(&at(0.0), 2, 0.2, Some(&h('0')));
        assert_eq!(
            hits.iter().map(|(k, _)| k.clone()).collect::<Vec<_>>(),
            [h('1'), h('2')]
        );
        assert!(hits[0].1 > hits[1].1);
        let all = s.top_k(&at(0.0), 10, 0.2, Some(&h('0')));
        assert_eq!(all.len(), 3);
        assert!(all.iter().all(|(k, sc)| *k != h('0') && *sc >= 0.2));
        assert_eq!(s.top_k(&at(0.0), 10, 0.2, None)[0].0, h('0'));
    }

    #[test]
    fn atomic_save() {
        let (dir, s) = three();
        s.save(dir.path()).unwrap();
        let before = fs::read(embeddings_path(dir.path())).unwrap();
        // Block the fixed tmp name with a directory, so the next save fails.
        fs::create_dir(dir.path().join("embeddings.bin.tmp")).unwrap();
        let mut s2 = EmbStore::load(dir.path(), &SIGLIP_B16_Q8);
        s2.put(&h('d'), unit(SIGLIP_B16_Q8.dim, 9));
        assert!(s2.save(dir.path()).is_err());
        assert_eq!(fs::read(embeddings_path(dir.path())).unwrap(), before);
    }

    #[test]
    fn put_ignores_bad_hash_and_wrong_dim() {
        let (_dir, mut s) = three();
        s.put("not-a-hash", unit(SIGLIP_B16_Q8.dim, 0));
        s.put(&h('e'), vec![1.0; 3]);
        assert_eq!(s.by_hash.len(), 3);
        assert!(!s.has("not-a-hash") && !s.has(&h('e')));
    }
}
