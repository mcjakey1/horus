//! Find similar (search option B): an optional, offline image–text model (SigLIP base).
//! Off by default; nothing else in the app depends on it.

pub mod download;
pub mod encoder;
pub mod model;
pub mod store;

/// At most this many "Looks similar" results, highest first.
pub const SIM_K: usize = 24;
/// References embedded per indexing batch.
pub const BATCH: usize = 16;
/// Sleep between indexing batches, in milliseconds.
pub const NAP_MS: u64 = 40;
