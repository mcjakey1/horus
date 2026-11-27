//! The background indexer: embeds the references the store lacks, in pausable batches.
//!
//! Low priority means `BATCH`, a `NAP_MS` sleep between batches, and the encoder's
//! `intra_threads = 2`; there is no OS priority API. The worker takes neither the app-state
//! nor the settings lock: only the encoder's mutex (per image) and the store's (per put, and
//! to encode a save; the write itself happens outside it).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread::JoinHandle;
use std::time::Duration;

use super::encoder::Embedder;
use super::store::{EmbStore, embeddings_path};
use super::{BATCH, NAP_MS};
use crate::library::write_atomic;

/// The store is saved after this many batches, so a quit loses at most that much work.
const SAVE_EVERY_BATCHES: usize = 8;
/// How often a paused worker looks at its flags.
const PAUSE_POLL: Duration = Duration::from_millis(10);

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

pub struct IndexJob {
    pub root: PathBuf,
    /// (image hash, its `thumbs/1024/<hash>.jpg`)
    pub items: Vec<(String, PathBuf)>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum IdxEvent {
    Progress {
        done: usize,
        total: usize,
    },
    Paused,
    /// (hash, reason) for every thumbnail that failed to load or encode.
    Finished {
        failed: Vec<(String, String)>,
    },
}

pub struct Indexer {
    worker: JoinHandle<()>,
    pause: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
}

impl Indexer {
    pub fn start(
        job: IndexJob,
        embedder: Arc<Mutex<Box<dyn Embedder>>>,
        store: Arc<Mutex<EmbStore>>,
        still_current: Box<dyn Fn() -> bool + Send>,
        on: Box<dyn Fn(IdxEvent) + Send>,
    ) -> Indexer {
        let pause = Arc::new(AtomicBool::new(false));
        let stop = Arc::new(AtomicBool::new(false));
        let w = Worker {
            embedder,
            store,
            still_current,
            on,
            pause: pause.clone(),
            stop: stop.clone(),
        };
        let worker = std::thread::Builder::new()
            .name("horus-indexer".into())
            .spawn(move || w.run(job))
            .expect("spawn the indexer thread");
        Indexer {
            worker,
            pause,
            stop,
        }
    }

    pub fn pause(&self, on: bool) {
        self.pause.store(on, Ordering::SeqCst);
    }

    /// Stops within one item and joins the worker, saving what was computed first.
    pub fn stop(self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = self.worker.join();
    }
}

struct Worker {
    embedder: Arc<Mutex<Box<dyn Embedder>>>,
    store: Arc<Mutex<EmbStore>>,
    still_current: Box<dyn Fn() -> bool + Send>,
    on: Box<dyn Fn(IdxEvent) + Send>,
    pause: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
}

impl Worker {
    fn run(self, job: IndexJob) {
        let todo: Vec<(String, PathBuf)> = {
            let store = lock(&self.store);
            let mut seen = HashSet::new();
            job.items
                .into_iter()
                .filter(|(h, _)| !store.has(h) && seen.insert(h.clone()))
                .collect()
        };
        let total = todo.len();
        let mut failed = vec![];
        let mut dirty = false;
        for (n, (hash, thumb)) in todo.iter().enumerate() {
            if n > 0 && n.is_multiple_of(BATCH) {
                if (n / BATCH).is_multiple_of(SAVE_EVERY_BATCHES)
                    && !self.save(&job.root, &mut dirty)
                {
                    return;
                }
                std::thread::sleep(Duration::from_millis(NAP_MS));
            }
            if self.stopped_while_paused() {
                self.save(&job.root, &mut dirty);
                return;
            }
            match self.embed(thumb) {
                Ok(v) => {
                    if !(self.still_current)() {
                        return;
                    }
                    lock(&self.store).put(hash, v);
                    dirty = true;
                }
                Err(e) => failed.push((hash.clone(), e)),
            }
            (self.on)(IdxEvent::Progress { done: n + 1, total });
        }
        if self.save(&job.root, &mut dirty) {
            (self.on)(IdxEvent::Finished { failed });
        }
    }

    /// Waits out a pause (reporting it once); `true` once `stop` is set.
    // ponytail: polls every 10 ms while paused; a Condvar only if that ever shows up in a profile.
    fn stopped_while_paused(&self) -> bool {
        let mut reported = false;
        loop {
            if self.stop.load(Ordering::SeqCst) {
                return true;
            }
            if !self.pause.load(Ordering::SeqCst) {
                return false;
            }
            if !reported {
                (self.on)(IdxEvent::Paused);
                reported = true;
            }
            std::thread::sleep(PAUSE_POLL);
        }
    }

    /// One thumbnail, holding the encoder's lock for this image only.
    fn embed(&self, thumb: &Path) -> Result<Vec<f32>, String> {
        let rgb = image::open(thumb)
            .map_err(|e| format!("Couldn't read the thumbnail: {e}"))?
            .to_rgb8();
        lock(&self.embedder).image(&rgb)
    }

    /// Encodes under the store's lock and writes outside it, only when something was put.
    /// `false` once the job is stale.
    fn save(&self, root: &Path, dirty: &mut bool) -> bool {
        if !(self.still_current)() {
            return false;
        }
        if !std::mem::take(dirty) {
            return true;
        }
        let bytes = lock(&self.store).encode();
        if let Err(e) = write_atomic(&embeddings_path(root), &bytes) {
            eprintln!("Find similar: couldn't save embeddings.bin: {e}");
            *dirty = true; // try again at the next save
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::similar::BATCH;
    use crate::similar::model::SIGLIP_B16_Q8;
    use crate::similar::store::embeddings_path;
    use std::sync::atomic::{AtomicU64, AtomicUsize};
    use std::sync::mpsc::{Receiver, channel};
    use std::time::{Duration, Instant};

    const DIM: usize = 768;

    /// Thumbnail `i` is a 2×2 PNG whose red channel is `i` (so `i < 256`).
    fn h(i: usize) -> String {
        format!("{i:064x}")
    }

    /// A deterministic vector per image: unit vector on axis `red`.
    fn vec_for(red: usize) -> Vec<f32> {
        let mut v = vec![0.0; DIM];
        v[red] = 1.0;
        v
    }

    struct Fake {
        calls: Arc<AtomicUsize>,
        sleep: Duration,
        fail_red: Option<u8>,
    }

    impl Embedder for Fake {
        fn image(&mut self, rgb: &image::RgbImage) -> Result<Vec<f32>, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(self.sleep);
            let red = rgb.get_pixel(0, 0)[0];
            if Some(red) == self.fail_red {
                return Err("fake encode failure".into());
            }
            Ok(vec_for(red as usize))
        }
        fn text(&mut self, _q: &str) -> Result<Vec<f32>, String> {
            Ok(vec_for(0))
        }
        fn dim(&self) -> usize {
            DIM
        }
    }

    struct Rig {
        dir: tempfile::TempDir,
        items: Vec<(String, PathBuf)>,
        calls: Arc<AtomicUsize>,
        embedder: Arc<Mutex<Box<dyn Embedder>>>,
        store: Arc<Mutex<EmbStore>>,
        generation: Arc<AtomicU64>,
    }

    fn rig(n: usize, sleep_ms: u64, fail_red: Option<u8>) -> Rig {
        let dir = tempfile::tempdir().unwrap();
        let items = (0..n)
            .map(|i| {
                let p = dir.path().join(format!("{i}.png"));
                image::RgbImage::from_pixel(2, 2, image::Rgb([i as u8, 0, 0]))
                    .save(&p)
                    .unwrap();
                (h(i), p)
            })
            .collect();
        let calls = Arc::new(AtomicUsize::new(0));
        let fake = Fake {
            calls: calls.clone(),
            sleep: Duration::from_millis(sleep_ms),
            fail_red,
        };
        let store = EmbStore::load(dir.path(), &SIGLIP_B16_Q8);
        Rig {
            items,
            calls,
            embedder: Arc::new(Mutex::new(Box::new(fake))),
            store: Arc::new(Mutex::new(store)),
            generation: Arc::new(AtomicU64::new(0)),
            dir,
        }
    }

    impl Rig {
        fn start(&self) -> (Indexer, Receiver<IdxEvent>) {
            let (tx, rx) = channel();
            let generation = self.generation.clone();
            let started = generation.load(Ordering::SeqCst);
            let job = IndexJob {
                root: self.dir.path().to_path_buf(),
                items: self.items.clone(),
            };
            let ix = Indexer::start(
                job,
                self.embedder.clone(),
                self.store.clone(),
                Box::new(move || generation.load(Ordering::SeqCst) == started),
                Box::new(move |e| {
                    let _ = tx.send(e);
                }),
            );
            (ix, rx)
        }

        fn on_disk(&self) -> EmbStore {
            EmbStore::load(self.dir.path(), &SIGLIP_B16_Q8)
        }
    }

    fn until_finished(rx: &Receiver<IdxEvent>) -> (Vec<IdxEvent>, Vec<(String, String)>) {
        let mut seen = vec![];
        loop {
            match rx
                .recv_timeout(Duration::from_secs(20))
                .expect("indexer went quiet")
            {
                IdxEvent::Finished { failed } => return (seen, failed),
                e => seen.push(e),
            }
        }
    }

    #[test]
    fn indexes_only_missing() {
        let r = rig(10, 0, None);
        {
            let mut s = r.store.lock().unwrap();
            for i in 0..4 {
                s.put(&h(i), vec_for(i));
            }
        }
        let (ix, rx) = r.start();
        let (_, failed) = until_finished(&rx);
        ix.stop();
        assert!(failed.is_empty());
        assert_eq!(r.calls.load(Ordering::SeqCst), 6);
        let disk = r.on_disk();
        assert_eq!(disk.len(), 10);
        assert_eq!(disk.get(&h(7)), Some(&vec_for(7)[..]));
    }

    #[test]
    fn pause_within_one_batch() {
        let r = rig(3 * BATCH, 5, None);
        let (ix, rx) = r.start();
        while r.calls.load(Ordering::SeqCst) < 3 {
            std::thread::sleep(Duration::from_millis(1));
        }
        ix.pause(true);
        let at_pause = r.calls.load(Ordering::SeqCst);
        loop {
            match rx.recv_timeout(Duration::from_secs(20)).unwrap() {
                IdxEvent::Paused => break,
                IdxEvent::Finished { .. } => panic!("finished instead of pausing"),
                _ => {}
            }
        }
        let paused_at = r.calls.load(Ordering::SeqCst);
        assert!(
            paused_at - at_pause <= BATCH,
            "{} calls after pause",
            paused_at - at_pause
        );
        std::thread::sleep(Duration::from_millis(60));
        assert_eq!(
            r.calls.load(Ordering::SeqCst),
            paused_at,
            "worked while paused"
        );
        ix.pause(false);
        let (_, failed) = until_finished(&rx);
        assert!(failed.is_empty());
        assert_eq!(r.on_disk().len(), 3 * BATCH);
        ix.stop();
    }

    #[test]
    fn stop_is_prompt_and_saves() {
        let r = rig(3 * BATCH, 10, None);
        let (ix, _rx) = r.start();
        while r.calls.load(Ordering::SeqCst) < 5 {
            std::thread::sleep(Duration::from_millis(1));
        }
        let t = Instant::now();
        ix.stop();
        // At most one batch late (BATCH × 10 ms), with slack for the save.
        assert!(
            t.elapsed() < Duration::from_millis(BATCH as u64 * 10 + 500),
            "{:?}",
            t.elapsed()
        );
        let calls = r.calls.load(Ordering::SeqCst);
        assert!(calls < 3 * BATCH);
        let disk = r.on_disk();
        assert_eq!(disk.len(), calls, "every computed vector is on disk");
        for i in 0..calls {
            assert_eq!(disk.get(&h(i)), Some(&vec_for(i)[..]));
        }
    }

    #[test]
    fn no_write_after_root_changes() {
        let r = rig(3 * BATCH, 5, None);
        let (ix, rx) = r.start();
        while r.calls.load(Ordering::SeqCst) < 3 {
            std::thread::sleep(Duration::from_millis(1));
        }
        r.generation.fetch_add(1, Ordering::SeqCst);
        let at_switch = r.calls.load(Ordering::SeqCst);
        ix.stop();
        assert!(
            !embeddings_path(r.dir.path()).exists(),
            "wrote to the old root"
        );
        // Nothing embedded after the switch is put (an item in flight is dropped).
        assert!(
            r.store.lock().unwrap().len() <= at_switch,
            "kept putting after the switch"
        );
        assert!(
            !rx.try_iter()
                .any(|e| matches!(e, IdxEvent::Finished { .. })),
            "a stale job reports nothing"
        );
    }

    #[test]
    fn search_interleaves() {
        let r = rig(BATCH, 30, None);
        let (ix, _rx) = r.start();
        while r.calls.load(Ordering::SeqCst) < 1 {
            std::thread::sleep(Duration::from_millis(1));
        }
        let t = Instant::now();
        let e = r.embedder.clone();
        let v = std::thread::spawn(move || e.lock().unwrap().text("x").unwrap())
            .join()
            .unwrap();
        assert_eq!(v.len(), DIM);
        // One image (30 ms) at most, never the whole batch (BATCH × 30 ms).
        assert!(
            t.elapsed() < Duration::from_millis(BATCH as u64 * 30 / 2),
            "{:?}",
            t.elapsed()
        );
        ix.stop();
    }

    #[test]
    fn failure_is_reported_and_skipped() {
        let r = rig(10, 0, Some(6));
        let (ix, rx) = r.start();
        let (_, failed) = until_finished(&rx);
        ix.stop();
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].0, h(6));
        assert!(failed[0].1.contains("fake encode failure"));
        let disk = r.on_disk();
        assert_eq!(disk.len(), 9);
        assert!(!disk.has(&h(6)));
    }

    #[test]
    fn unreadable_thumbnail_is_reported() {
        let mut r = rig(3, 0, None);
        r.items[1].1 = r.dir.path().join("missing.jpg");
        let (ix, rx) = r.start();
        let (_, failed) = until_finished(&rx);
        ix.stop();
        assert_eq!(
            failed.iter().map(|f| f.0.clone()).collect::<Vec<_>>(),
            [h(1)]
        );
        assert_eq!(r.on_disk().len(), 2);
    }

    #[test]
    fn progress_monotonic() {
        let r = rig(2 * BATCH + 3, 0, None);
        let (ix, rx) = r.start();
        let (seen, _) = until_finished(&rx);
        ix.stop();
        let progress: Vec<(usize, usize)> = seen
            .iter()
            .filter_map(|e| match e {
                IdxEvent::Progress { done, total } => Some((*done, *total)),
                _ => None,
            })
            .collect();
        assert!(!progress.is_empty());
        assert!(progress.windows(2).all(|w| w[0].0 <= w[1].0));
        let (done, total) = *progress.last().unwrap();
        assert_eq!((done, total), (2 * BATCH + 3, 2 * BATCH + 3));
    }
}
