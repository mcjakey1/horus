//! Plan 5 Task 5: the Find similar commands, their state, the status events and the B4
//! indexer hooks around a library switch.
//!
//! Lock order: import gate, `similar_start`, settings, state, then `similar`. Under `similar`
//! only fields flip and Arcs clone: no store or encoder lock, no file I/O, no emit, no join.
//! An indexer is joined only with no lock held, and never from its own `on` callback.
//! While an indexer runs it is the only writer of `embeddings.bin` (fixed `.tmp` name).

use super::*;
use crate::import::{Skip, decode_srgb, on_white};
use crate::settings::FindSimilar;
use crate::similar::SIM_K;
use crate::similar::copy;
use crate::similar::download::{self, DlError, DlEvent};
use crate::similar::encoder::{Embedder, LoadError, SiglipEncoder};
pub use crate::similar::indexer::Indexer;
use crate::similar::indexer::{IdxEvent, IndexJob};
use crate::similar::model::{self as smodel, ModelSpec, SIGLIP_B16_Q8};
use crate::similar::store::{EmbStore, embeddings_path};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicU64;

/// ONNX Runtime threads per session: "low priority" (Global Constraints).
const INTRA_THREADS: usize = 2;
/// Progress events at most 4 a second; phase changes always go out.
const EMIT_EVERY: Duration = Duration::from_millis(250);
pub const STATUS_EVENT: &str = "similar://status";

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    #[default]
    Off,
    Downloading,
    Verifying,
    Loading,
    Indexing,
    Paused,
    Ready,
    Error,
}

impl Phase {
    /// The model is loaded: searches answer.
    fn searchable(self) -> bool {
        matches!(self, Phase::Ready | Phase::Indexing | Phase::Paused)
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimilarStatus {
    pub phase: Phase,
    pub download_done: u64,
    /// Always the model's full size, in every phase.
    pub download_total: u64,
    pub indexed: usize,
    pub total: usize,
    /// The model folder (recursive, C8) plus the library's `embeddings.bin`.
    pub disk_bytes: u64,
    /// Artist copy from `similar/copy.rs` only.
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimHit {
    pub id: String,
    pub score: f32,
}

type Loader = dyn Fn(&Path) -> Result<Box<dyn Embedder>, LoadError> + Send + Sync;
type Shared<T> = Arc<Mutex<T>>;

/// What `setup` wires in: where the model lives, how it loads, and the CPU check (R1).
/// Tests manage a fake one, so no test reaches ONNX Runtime.
pub struct SimilarEnv {
    pub model_dir: PathBuf,
    pub spec: &'static ModelSpec,
    pub load: Box<Loader>,
    pub has_avx2: fn() -> bool,
    /// `download::agent` (HTTPS only); tests use a plain-http one for a local server.
    pub agent: fn() -> ureq::Agent,
}

impl SimilarEnv {
    /// The real one: SigLIP in `app_local_data/models/<id>`, ORT from the bundle.
    pub fn new(app_local_data: &Path, ort_lib: PathBuf) -> SimilarEnv {
        SimilarEnv {
            model_dir: smodel::model_dir(app_local_data, &SIGLIP_B16_Q8),
            spec: &SIGLIP_B16_Q8,
            load: Box::new(move |dir: &Path| {
                SiglipEncoder::load(&ort_lib, dir, &SIGLIP_B16_Q8, INTRA_THREADS)
                    .map(|e| Box::new(e) as Box<dyn Embedder>)
            }),
            has_avx2,
            agent: download::agent,
        }
    }
}

/// R1: ORT's x86_64 builds may need AVX2, and an illegal instruction can't be caught.
pub fn has_avx2() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        std::is_x86_feature_detected!("avx2")
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        true
    }
}

/// Lives in `AppState.similar`.
#[derive(Default)]
pub struct SimilarState {
    phase: Phase,
    error: Option<String>,
    download_done: u64,
    indexed: usize,
    total: usize,
    encoder: Option<Shared<Box<dyn Embedder>>>,
    store: Option<Shared<EmbStore>>,
    /// The library `store` (and the last pass) belongs to.
    root: Option<PathBuf>,
    indexer: Option<Indexer>,
    /// Tags the live indexer, so a late reaper never takes the next one.
    indexer_run: u64,
    /// Bumped on every library switch: the indexer's `still_current` guard (R7).
    generation: Arc<AtomicU64>,
    /// Tags the enable pipeline, so an older one never writes after disable.
    run: u64,
    download_cancel: Arc<AtomicBool>,
    paused: bool,
    /// Hashes the change hook queued for the next pass.
    pending: Vec<String>,
    /// Hashes that failed to index in this library: not retried until it is reopened.
    failed: HashSet<String>,
    last_emit: Option<Instant>,
}

const OFF: &str = "FindSimilarOff";

fn similar_of<R: Runtime>(app: &AppHandle<R>) -> MutexGuard<'_, SimilarState> {
    lock(&app.state::<AppState>().inner().similar)
}

/// The model folder (recursive, C8) plus `root`'s `embeddings.bin`.
fn disk_bytes(model_dir: Option<&Path>, root: Option<&Path>) -> u64 {
    let model: u64 = model_dir.map_or(0, |d| {
        walkdir::WalkDir::new(d)
            .into_iter()
            .filter_map(Result::ok)
            .filter_map(|e| e.metadata().ok())
            .filter(|m| m.is_file())
            .map(|m| m.len())
            .sum()
    });
    let emb = root
        .and_then(|r| std::fs::metadata(embeddings_path(r)).ok())
        .map_or(0, |m| m.len());
    model + emb
}

fn build_status<R: Runtime>(app: &AppHandle<R>) -> SimilarStatus {
    let (phase, download_done, indexed, total, error, root) = {
        let s = similar_of(app);
        (
            s.phase,
            s.download_done,
            s.indexed,
            s.total,
            s.error.clone(),
            s.root.clone(),
        )
    };
    let model_dir = app.try_state::<SimilarEnv>().map(|e| e.model_dir.clone());
    SimilarStatus {
        phase,
        download_done,
        download_total: SIGLIP_B16_Q8.total_bytes(),
        indexed,
        total,
        disk_bytes: disk_bytes(model_dir.as_deref(), root.as_deref()),
        error,
    }
}

/// Emits `similar://status`: always on a phase change (`force`), else at most every 250 ms.
fn publish<R: Runtime>(app: &AppHandle<R>, force: bool) {
    {
        let mut s = similar_of(app);
        let now = Instant::now();
        if !force
            && s.last_emit
                .is_some_and(|t| now.duration_since(t) < EMIT_EVERY)
        {
            return;
        }
        s.last_emit = Some(now);
    }
    let _ = app.emit(STATUS_EVENT, build_status(app));
}

/// Sets the phase if `run` is still the live pipeline; `false` once it is stale.
fn set_phase<R: Runtime>(app: &AppHandle<R>, run: u64, phase: Phase) -> bool {
    {
        let mut s = similar_of(app);
        if s.run != run {
            return false;
        }
        s.phase = phase;
    }
    publish(app, true);
    true
}

/// Raw text to stderr, copy to the artist (R11).
fn set_find_similar(st: &AppState, v: FindSimilar) -> Result<(), String> {
    update_settings(
        st,
        SettingsPatch {
            find_similar: Some(v),
            ..SettingsPatch::default()
        },
    )
    .map_err(|e| {
        eprintln!("Find similar: {e}");
        copy::UNKNOWN.to_string()
    })
}

/// A failure the artist sees as copy; the raw text goes to stderr.
enum Failure {
    Download(DlError),
    Load(LoadError),
    NoAvx2,
    Other(String),
}

/// Phase `Error` with the copy, the model dropped, and `find_similar` back to "off" (Review
/// Focus 2 and 3). `similar` is released before the settings write (lock order).
fn record_failure<R: Runtime>(app: &AppHandle<R>, run: u64, f: Failure) {
    let copy = match &f {
        Failure::Download(e) => {
            eprintln!("Find similar: the download failed: {e:?}");
            copy::download(e)
        }
        Failure::Load(e) => {
            eprintln!("Find similar: the model couldn't load: {e:?}");
            copy::load(e)
        }
        Failure::NoAvx2 => {
            eprintln!("Find similar: this processor has no AVX2");
            copy::NO_AVX2
        }
        Failure::Other(e) => {
            eprintln!("Find similar: {e}");
            copy::UNKNOWN
        }
    };
    {
        let mut s = similar_of(app);
        if s.run != run {
            return;
        }
        s.phase = Phase::Error;
        s.error = Some(copy.to_string());
        s.encoder = None;
        s.download_done = 0;
    }
    let _ = set_find_similar(&app.state::<AppState>(), FindSimilar::Off);
    publish(app, true);
}

/// A new pipeline run, unless one is already running or done. A fresh cancel flag per run,
/// so an older download can't be revived.
fn begin<R: Runtime>(app: &AppHandle<R>) -> Option<(u64, Arc<AtomicBool>)> {
    let mut s = similar_of(app);
    if !matches!(s.phase, Phase::Off | Phase::Error) {
        return None;
    }
    s.run += 1;
    s.download_cancel = Arc::new(AtomicBool::new(false));
    s.error = None;
    s.download_done = 0;
    s.phase = Phase::Loading;
    Some((s.run, s.download_cancel.clone()))
}

fn spawn_pipeline<R: Runtime>(app: &AppHandle<R>, run: u64, cancel: Arc<AtomicBool>) {
    publish(app, true);
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("horus-similar".into())
        .spawn(move || pipeline(&app, run, &cancel));
    if let Err(e) = spawned {
        eprintln!("Find similar: couldn't start its thread: {e}");
    }
}

/// CPU check, download (resumable) if needed, load, then the start hook. Off the main thread.
fn pipeline<R: Runtime>(app: &AppHandle<R>, run: u64, cancel: &AtomicBool) {
    let Some(env) = app.try_state::<SimilarEnv>() else {
        return record_failure(
            app,
            run,
            Failure::Other("Find similar is not set up".into()),
        );
    };
    // R1: before the download as well as the load.
    if !(env.has_avx2)() {
        return record_failure(app, run, Failure::NoAvx2);
    }
    // A cancelled download from an earlier run may still sit in a read: wait it out, so two
    // writers never share one `.part` (task review).
    let download_guard = lock(&app.state::<AppState>().inner().similar_download);
    if !smodel::is_installed(&env.model_dir, env.spec) {
        if !set_phase(app, run, Phase::Downloading) {
            return;
        }
        let agent = (env.agent)();
        let mut on = |e: DlEvent| match e {
            DlEvent::Progress { done, .. } => {
                {
                    let mut s = similar_of(app);
                    if s.run == run {
                        s.download_done = done;
                    }
                }
                publish(app, false);
            }
            DlEvent::Verifying => {
                set_phase(app, run, Phase::Verifying);
            }
            DlEvent::Done => {}
        };
        match download::download(env.spec, &env.model_dir, &agent, cancel, &mut on) {
            Ok(()) => {}
            Err(DlError::Cancelled) => {
                return;
            }
            Err(e) => {
                drop(download_guard);
                return record_failure(app, run, Failure::Download(e));
            }
        }
    }
    drop(download_guard);
    if !set_phase(app, run, Phase::Loading) {
        return;
    }
    let encoder = match (env.load)(&env.model_dir) {
        Ok(e) => e,
        Err(e) => return record_failure(app, run, Failure::Load(e)),
    };
    {
        let mut s = similar_of(app);
        if s.run != run {
            return; // disabled meanwhile: the encoder drops here
        }
        s.encoder = Some(Arc::new(Mutex::new(encoder)));
        s.phase = Phase::Ready;
    }
    publish(app, true);
    start_hook(app);
}

/// The indexer's events. Takes only `similar`; never joins (the worker is calling it).
fn on_index<R: Runtime>(app: &AppHandle<R>, run: u64, base: usize) -> Box<dyn Fn(IdxEvent) + Send> {
    let app = app.clone();
    Box::new(move |e| match e {
        IdxEvent::Progress { done, .. } => {
            {
                let mut s = similar_of(&app);
                if s.indexer_run != run {
                    return;
                }
                s.indexed = base + done;
            }
            publish(&app, false);
        }
        IdxEvent::Paused => {
            {
                let mut s = similar_of(&app);
                if s.indexer_run != run {
                    return;
                }
                if s.phase == Phase::Indexing {
                    s.phase = Phase::Paused;
                }
            }
            publish(&app, true);
        }
        IdxEvent::Finished { failed } => {
            {
                let mut s = similar_of(&app);
                if s.indexer_run != run {
                    return;
                }
                for (hash, why) in failed {
                    eprintln!("Find similar: couldn't index {hash}: {why}");
                    s.failed.insert(hash);
                }
            }
            // A short thread takes this run's indexer and joins it, never the worker itself.
            let app = app.clone();
            let spawned = std::thread::Builder::new()
                .name("horus-similar-reap".into())
                .spawn(move || reap(&app, run));
            if let Err(e) = spawned {
                eprintln!("Find similar: couldn't finish the index pass: {e}");
            }
        }
    })
}

/// After a pass finished: join it (no lock held), then start another for anything new.
fn reap<R: Runtime>(app: &AppHandle<R>, run: u64) {
    let idx = {
        let mut s = similar_of(app);
        if s.indexer_run != run {
            return;
        }
        if matches!(s.phase, Phase::Indexing | Phase::Paused) {
            s.phase = Phase::Ready;
        }
        s.indexer.take()
    };
    if let Some(i) = idx {
        i.stop();
    }
    publish(app, true);
    start_hook(app);
}

/// B4: the start pass, with no lock held by the caller. Starts an indexer only when Find
/// similar is ready and none runs, for whichever library is open. Single-flight. It prunes
/// hashes no longer in the library (R7) and saves that before the indexer starts, so the
/// indexer stays the only writer of `embeddings.bin` while it runs.
pub(crate) fn start_hook<R: Runtime>(app: &AppHandle<R>) {
    let Some(env) = app.try_state::<SimilarEnv>() else {
        return;
    };
    let st = app.state::<AppState>();
    let _one = lock(&st.similar_start);
    // Before the snapshot: a switch that lands in between makes this pass stale, never the
    // old library's pass under the new generation (task review).
    let generation = lock(&st.similar).generation.load(Ordering::SeqCst);
    let snapshot = {
        let open = lock(&st.open);
        open.as_ref().map(|o| {
            let items: Vec<(String, PathBuf)> = visible(&o.lib)
                .references
                .iter()
                .filter_map(|r| {
                    let thumb = thumb_path_in(&o.lib.root, &r.hash, 1024).ok()?;
                    Some((r.hash.clone(), thumb))
                })
                .collect();
            (o.lib.root.clone(), items)
        })
    };
    let Some((root, items)) = snapshot else {
        return;
    };
    let (gen_arc, encoder, store, failed) = {
        let mut s = lock(&st.similar);
        if s.generation.load(Ordering::SeqCst) != generation
            || !s.phase.searchable()
            || s.indexer.is_some()
        {
            return;
        }
        let Some(encoder) = s.encoder.clone() else {
            return;
        };
        let same = s.root.as_deref() == Some(root.as_path());
        if !same {
            s.failed.clear();
        }
        let store = if same { s.store.clone() } else { None };
        (s.generation.clone(), encoder, store, s.failed.clone())
    };
    let store = store.unwrap_or_else(|| Arc::new(Mutex::new(EmbStore::load(&root, env.spec))));
    let keep: HashSet<String> = items.iter().map(|(h, _)| h.clone()).collect();
    let (save, missing, present) = {
        let mut g = lock(&store);
        let pruned = g.prune(&keep);
        let mut seen = HashSet::new();
        let missing: Vec<(String, PathBuf)> = items
            .into_iter()
            .filter(|(h, _)| !g.has(h) && !failed.contains(h) && seen.insert(h.clone()))
            .collect();
        let present = keep.iter().filter(|h| g.has(h)).count();
        ((pruned > 0).then(|| g.encode()), missing, present)
    };
    // Not after a switch or a disable (AGY #2): that library's pass is no longer ours to save.
    if gen_arc.load(Ordering::SeqCst) != generation {
        return;
    }
    if let Some(bytes) = save
        && let Err(e) = crate::library::write_atomic(&embeddings_path(&root), &bytes)
    {
        eprintln!("Find similar: couldn't save embeddings.bin: {e}");
    }
    let mut s = lock(&st.similar);
    if s.generation.load(Ordering::SeqCst) != generation
        || !s.phase.searchable()
        || s.indexer.is_some()
    {
        return; // switched, disabled or started meanwhile: that path runs its own pass
    }
    s.store = Some(store.clone());
    s.root = Some(root.clone());
    s.total = keep.len();
    s.indexed = present;
    s.pending.clear();
    if missing.is_empty() {
        s.phase = Phase::Ready;
        drop(s);
        publish(app, true);
        return;
    }
    s.indexer_run += 1;
    let run = s.indexer_run;
    let still_current: Box<dyn Fn() -> bool + Send> =
        Box::new(move || gen_arc.load(Ordering::SeqCst) == generation);
    let job = IndexJob {
        root,
        items: missing,
    };
    let indexer = Indexer::start(
        job,
        encoder,
        store,
        still_current,
        on_index(app, run, present),
    );
    if s.paused {
        indexer.pause(true);
        s.phase = Phase::Paused;
    } else {
        s.phase = Phase::Indexing;
    }
    s.indexer = Some(indexer);
    drop(s);
    publish(app, true);
}

/// B4: takes the indexer out and bumps the generation, so the old worker's `still_current()`
/// is already false. The caller joins it with no lock held.
pub(super) fn detach_indexer(st: &AppState) -> Option<Indexer> {
    let mut s = lock(&st.similar);
    s.generation.fetch_add(1, Ordering::SeqCst);
    s.indexer_run += 1;
    s.failed.clear(); // a reopened library retries what failed
    if matches!(s.phase, Phase::Indexing | Phase::Paused) {
        s.phase = Phase::Ready;
    }
    s.indexer.take()
}

/// The change hook (Cross-plan audit row 11): queues hashes the store lacks. No encoder lock,
/// no I/O; a pass starts on its own thread, only when something was queued and none runs.
pub fn on_change<R: Runtime>(app: &AppHandle<R>, change: &Change) {
    if change.references.is_empty() {
        return;
    }
    let store = {
        let s = similar_of(app);
        if !s.phase.searchable() {
            return;
        }
        s.store.clone()
    };
    let Some(store) = store else {
        return;
    };
    let new: Vec<String> = {
        let g = lock(&store);
        change
            .references
            .iter()
            .map(|r| r.hash())
            .filter(|h| !g.has(h))
            .map(str::to_owned)
            .collect()
    };
    let start = {
        let mut s = similar_of(app);
        let mut queued = false;
        for h in new {
            if !s.pending.contains(&h) {
                s.pending.push(h);
                queued = true;
            }
        }
        queued && s.indexer.is_none() && s.encoder.is_some()
    };
    if start {
        let app = app.clone();
        let spawned = std::thread::Builder::new()
            .name("horus-similar-start".into())
            .spawn(move || start_hook(&app));
        if let Err(e) = spawned {
            eprintln!("Find similar: couldn't start an index pass: {e}");
        }
    }
}

/// Start-up (B4): when the settings say "on", resume the `.part` download if any, load, index.
pub fn resume_on_start<R: Runtime>(app: &AppHandle<R>) {
    let st = app.state::<AppState>();
    if settings::load(&st.config_dir).find_similar != FindSimilar::On {
        return;
    }
    if let Some((run, cancel)) = begin(app) {
        spawn_pipeline(app, run, cancel);
    }
}

/// Stops everything: the pipeline goes stale, the download cancels, the indexer and the
/// encoder come out. The caller joins and drops them with no lock held.
fn shut_down(st: &AppState) -> (Option<Indexer>, Option<Shared<Box<dyn Embedder>>>) {
    let mut s = lock(&st.similar);
    s.run += 1;
    s.download_cancel.store(true, Ordering::SeqCst);
    // No generation bump: the stopped indexer still saves its last batches (task review).
    s.indexer_run += 1;
    s.phase = Phase::Off;
    s.error = None;
    s.download_done = 0;
    s.indexed = 0;
    s.total = 0;
    s.store = None;
    s.pending.clear();
    (s.indexer.take(), s.encoder.take())
}

/// The encoder, the store and the spec a search needs.
type QueryParts = (
    Shared<Box<dyn Embedder>>,
    Shared<EmbStore>,
    &'static ModelSpec,
);

/// The model's query parts, or `FindSimilarOff` unless the phase is Ready, Indexing or Paused.
fn ready<R: Runtime>(app: &AppHandle<R>) -> Result<QueryParts, String> {
    let spec = app.try_state::<SimilarEnv>().map(|e| e.spec).ok_or(OFF)?;
    let s = similar_of(app);
    match (s.phase.searchable(), &s.encoder, &s.store) {
        (true, Some(e), Some(st)) => Ok((e.clone(), st.clone(), spec)),
        _ => Err(OFF.into()),
    }
}

/// Image hashes to every visible reference with that hash, in score order, minus `skip`.
fn hits<R: Runtime>(
    app: &AppHandle<R>,
    scored: &[(String, f32)],
    skip: Option<&str>,
) -> Vec<SimHit> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    let Some(o) = open.as_ref() else {
        return vec![];
    };
    let data = visible(&o.lib);
    let mut by_hash: HashMap<&str, Vec<&str>> = HashMap::new();
    for r in &data.references {
        by_hash
            .entry(r.hash.as_str())
            .or_default()
            .push(r.id.as_str());
    }
    let mut out: Vec<SimHit> = scored
        .iter()
        .flat_map(|(h, score)| {
            by_hash
                .get(h.as_str())
                .into_iter()
                .flatten()
                .filter(|id| Some(**id) != skip)
                .map(|id| SimHit {
                    id: id.to_string(),
                    score: *score,
                })
        })
        .collect();
    out.truncate(SIM_K);
    out
}

/// A file outside the library, decoded once in memory (R8): never copied or imported.
fn file_vector(enc: &Shared<Box<dyn Embedder>>, path: &Path) -> Result<Vec<f32>, String> {
    let d = decode_srgb(path).map_err(|e| match e {
        Skip::TooLarge(_) => "TooLarge".to_string(),
        _ => "Unreadable".to_string(),
    })?;
    lock(enc).image(&on_white(&d.rgba)).map_err(|e| {
        eprintln!("Find similar: couldn't embed the dropped image: {e}");
        copy::UNKNOWN.to_string()
    })
}

#[tauri::command(async)]
pub fn similar_status<R: Runtime>(app: AppHandle<R>) -> Result<SimilarStatus, String> {
    Ok(build_status(&app))
}

/// Sets `find_similar` "on", then downloads if needed, loads and indexes, in the background.
#[tauri::command(async)]
pub fn similar_enable<R: Runtime>(app: AppHandle<R>) -> Result<SimilarStatus, String> {
    set_find_similar(&app.state::<AppState>(), FindSimilar::On)?;
    if let Some((run, cancel)) = begin(&app) {
        spawn_pipeline(&app, run, cancel);
    }
    Ok(build_status(&app))
}

/// Sets "off", stops indexing and frees the encoder. The model and `embeddings.bin` stay.
#[tauri::command(async)]
pub fn similar_disable<R: Runtime>(app: AppHandle<R>) -> Result<SimilarStatus, String> {
    let st = app.state::<AppState>();
    let (indexer, encoder) = shut_down(&st);
    if let Some(i) = indexer {
        i.stop();
    }
    drop(encoder);
    set_find_similar(&st, FindSimilar::Off)?;
    publish(&app, true);
    Ok(build_status(&app))
}

/// Disable, then delete the model folder and the open library's `embeddings.bin`.
#[tauri::command(async)]
pub fn similar_remove_model<R: Runtime>(app: AppHandle<R>) -> Result<SimilarStatus, String> {
    let st = app.state::<AppState>();
    // Serialized with the start hook, so a pass can't re-save embeddings.bin after the delete.
    let _one = lock(&st.similar_start);
    let (indexer, encoder) = shut_down(&st);
    if let Some(i) = indexer {
        i.stop();
    }
    drop(encoder); // the model files are closed before they are deleted
    set_find_similar(&st, FindSimilar::Off)?;
    let root = lock(&st.open).as_ref().map(|o| o.lib.root.clone());
    let gone = |r: std::io::Result<()>| match r {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    };
    let mut result = Ok(());
    let _download = lock(&st.similar_download); // a cancelled download has let go of its files
    if let Some(env) = app.try_state::<SimilarEnv>() {
        result = gone(std::fs::remove_dir_all(&env.model_dir));
    }
    if let Some(root) = root {
        result = result.and(gone(std::fs::remove_file(embeddings_path(&root))));
    }
    publish(&app, true);
    if let Err(e) = result {
        eprintln!("Find similar: couldn't remove the model: {e}");
        return Err(copy::UNKNOWN.into());
    }
    Ok(build_status(&app))
}

#[tauri::command(async)]
pub fn similar_pause<R: Runtime>(app: AppHandle<R>, paused: bool) -> Result<SimilarStatus, String> {
    {
        let mut s = similar_of(&app);
        s.paused = paused;
        if let Some(i) = &s.indexer {
            i.pause(paused);
            s.phase = if paused {
                Phase::Paused
            } else {
                Phase::Indexing
            };
        }
    }
    publish(&app, true);
    Ok(build_status(&app))
}

/// "NotIndexedYet" when the reference has no embedding yet. Never lists the query itself,
/// but does list another reference with the same image.
#[tauri::command(async)]
pub fn similar_by_ref<R: Runtime>(app: AppHandle<R>, id: String) -> Result<Vec<SimHit>, String> {
    let (_, store, spec) = ready(&app)?;
    let hash = {
        let st = app.state::<AppState>();
        let open = lock(&st.open);
        let o = open.as_ref().ok_or(NO_LIBRARY)?;
        visible(&o.lib)
            .references
            .iter()
            .find(|r| r.id == id)
            .map(|r| r.hash.clone())
            .ok_or_else(|| format!("UnknownReference:{id}"))?
    };
    let scored = {
        let g = lock(&store);
        let q = g.get(&hash).ok_or("NotIndexedYet")?.to_vec();
        // One extra: the query's own hash scores 1.0 and is dropped after the mapping.
        g.top_k(&q, SIM_K + 1, spec.sim_min_image, None)
    };
    Ok(hits(&app, &scored, Some(&id)))
}

#[tauri::command(async)]
pub fn similar_by_text<R: Runtime>(app: AppHandle<R>, q: String) -> Result<Vec<SimHit>, String> {
    let (encoder, store, spec) = ready(&app)?;
    let v = lock(&encoder).text(&q).map_err(|e| {
        eprintln!("Find similar: the text query failed: {e}");
        copy::UNKNOWN.to_string()
    })?;
    let scored = lock(&store).top_k(&v, SIM_K, spec.sim_min_text, None);
    Ok(hits(&app, &scored, None))
}

/// `decode_srgb`, then `on_white`, then embed, in memory. "TooLarge" or "Unreadable" (R8).
#[tauri::command(async)]
pub fn similar_by_file<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Vec<SimHit>, String> {
    let (encoder, store, spec) = ready(&app)?;
    let v = file_vector(&encoder, Path::new(&path))?;
    let scored = lock(&store).top_k(&v, SIM_K, spec.sim_min_image, None);
    Ok(hits(&app, &scored, None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tests::*;
    use crate::import::MAX_BYTES;
    use std::fs;
    use std::sync::atomic::AtomicUsize;
    use tauri::test::MockRuntime;

    const DIM: usize = 8;

    /// The test model: tiny, with SigLIP's cut-offs, and a base nothing listens on, so any
    /// download attempt fails as `Network` (and the pipeline ends in `Error`, not `Ready`).
    fn test_spec() -> &'static ModelSpec {
        Box::leak(Box::new(ModelSpec {
            id: "test-model",
            base: "http://127.0.0.1:9",
            repo: "test/repo",
            revision: "rev1",
            files: Box::leak(Box::new([smodel::ModelFile {
                path: "m.bin",
                size: 3,
                sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            }])),
            dim: DIM,
            text_len: 8,
            pad_id: 1,
            lowercase: true,
            sim_min_image: SIGLIP_B16_Q8.sim_min_image,
            sim_min_text: SIGLIP_B16_Q8.sim_min_text,
        }))
    }

    /// A unit vector at cosine `c` to axis 0, leaning into `axis`.
    fn at_cos(c: f32, axis: usize) -> Vec<f32> {
        let mut v = vec![0.0; DIM];
        v[0] = c;
        v[axis] = (1.0 - c * c).sqrt();
        v
    }

    /// Images embed as the mean colour of their top and bottom halves (orientation-sensitive);
    /// every text embeds as axis 0. Can sleep per image.
    struct Fake {
        calls: Arc<AtomicUsize>,
        sleep: Duration,
    }

    impl Embedder for Fake {
        fn image(&mut self, rgb: &image::RgbImage) -> Result<Vec<f32>, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(self.sleep);
            let (w, h) = rgb.dimensions();
            let mut v = vec![0.0f32; DIM];
            for (x, y, p) in rgb.enumerate_pixels() {
                let half = if y < h / 2 { 0 } else { 3 };
                for c in 0..3 {
                    v[half + c] += f32::from(p[c]) / 255.0;
                }
                let _ = x;
            }
            v.iter_mut().for_each(|x| *x /= (w * h) as f32);
            v[6] = 0.5;
            crate::similar::encoder::l2(&mut v);
            Ok(v)
        }
        fn text(&mut self, _q: &str) -> Result<Vec<f32>, String> {
            Ok(at_cos(1.0, 1))
        }
        fn dim(&self) -> usize {
            DIM
        }
    }

    struct Rig {
        e: Env,
        calls: Arc<AtomicUsize>,
        loads: Arc<AtomicUsize>,
        model: tempfile::TempDir,
    }

    impl Rig {
        fn h(&self) -> AppHandle<MockRuntime> {
            self.e.handle()
        }
        fn status(&self) -> SimilarStatus {
            similar_status(self.h()).unwrap()
        }
        fn wait(&self, what: &str, ok: impl Fn(&SimilarStatus) -> bool) -> SimilarStatus {
            let deadline = Instant::now() + Duration::from_secs(20);
            loop {
                let s = self.status();
                if ok(&s) {
                    return s;
                }
                assert!(
                    Instant::now() < deadline,
                    "timed out waiting for {what}: {s:?}"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
        }
        fn similar(&self) -> MutexGuard<'_, SimilarState> {
            lock(&self.e.app.state::<AppState>().inner().similar)
        }
        fn import(&self, names: &[&str]) {
            let paths = names
                .iter()
                .map(|n| fixture(n).to_string_lossy().into_owned())
                .collect();
            tauri::async_runtime::block_on(import_paths(self.h(), paths, None, None)).unwrap();
        }
        fn root(&self) -> PathBuf {
            let st = self.e.app.state::<AppState>();
            lock(&st.open).as_ref().unwrap().lib.root.clone()
        }
    }

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    /// An app with a library, a pre-installed fake model, and the fake encoder.
    fn rig_with(sleep: Duration, avx2: fn() -> bool, load_ok: bool) -> Rig {
        rig_full(test_spec(), true, sleep, avx2, load_ok)
    }

    /// `installed`: the model folder already holds `m.bin` and `.ok`; else it is empty.
    fn rig_full(
        spec: &'static ModelSpec,
        installed: bool,
        sleep: Duration,
        avx2: fn() -> bool,
        load_ok: bool,
    ) -> Rig {
        let e = created();
        let model = tempfile::tempdir().unwrap();
        if installed {
            fs::write(model.path().join("m.bin"), b"abc").unwrap();
            fs::write(model.path().join(".ok"), b"").unwrap();
            assert!(smodel::is_installed(model.path(), spec));
        }
        let calls = Arc::new(AtomicUsize::new(0));
        let loads = Arc::new(AtomicUsize::new(0));
        let (c, l) = (calls.clone(), loads.clone());
        e.app.manage(SimilarEnv {
            model_dir: model.path().to_path_buf(),
            spec,
            load: Box::new(move |_dir: &Path| {
                l.fetch_add(1, Ordering::SeqCst);
                if load_ok {
                    Ok(Box::new(Fake {
                        calls: c.clone(),
                        sleep,
                    }) as Box<dyn Embedder>)
                } else {
                    Err(LoadError::Lib("LoadLibraryExW failed: raw ORT text".into()))
                }
            }),
            has_avx2: avx2,
            agent: download::local_test_agent,
        });
        let h = e.handle();
        hooks::register(&e.handle(), move |c| on_change(&h, c));
        Rig {
            e,
            calls,
            loads,
            model,
        }
    }

    /// Serves `m.bin` ("abc") after a delay, logging (accepted, answered) per connection.
    /// (accepted, answered) per connection.
    type ConnLog = Arc<Mutex<Vec<(Instant, Instant)>>>;

    fn slow_server(delay: Duration) -> (String, ConnLog) {
        use std::io::{BufRead, BufReader, Write};
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://127.0.0.1:{}", l.local_addr().unwrap().port());
        let log = Arc::new(Mutex::new(vec![]));
        let seen = log.clone();
        std::thread::spawn(move || {
            for mut s in l.incoming().flatten() {
                let seen = seen.clone();
                std::thread::spawn(move || {
                    let accepted = Instant::now();
                    let mut r = BufReader::new(s.try_clone().unwrap());
                    let mut line = String::new();
                    while r.read_line(&mut line).unwrap_or(0) > 0 && line != "\r\n" {
                        line.clear();
                    }
                    std::thread::sleep(delay);
                    let _ = s.write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc",
                    );
                    let _ = s.shutdown(std::net::Shutdown::Write);
                    lock(&seen).push((accepted, Instant::now()));
                });
            }
        });
        (base, log)
    }

    #[test]
    fn reenable_waits_for_cancelled_download() {
        // Task review: a disable cancels the download, but its thread can sit in a read; a
        // re-enable must not start a second writer on the same `.part`.
        let (base, log) = slow_server(Duration::from_millis(500));
        let spec: &'static ModelSpec = Box::leak(Box::new(ModelSpec {
            base: Box::leak(base.into_boxed_str()),
            ..*test_spec()
        }));
        let r = rig_full(spec, false, Duration::ZERO, || true, true);
        similar_enable(r.h()).unwrap();
        r.wait("downloading", |s| s.phase == Phase::Downloading);
        std::thread::sleep(Duration::from_millis(100));
        similar_disable(r.h()).unwrap();
        similar_enable(r.h()).unwrap();
        let s = r.wait("ready", |s| {
            s.phase == Phase::Ready || s.phase == Phase::Error
        });
        assert_eq!(s.phase, Phase::Ready, "{s:?}");
        assert_eq!(fs::read(r.model.path().join("m.bin")).unwrap(), b"abc");
        assert_eq!(r.e.settings().find_similar, FindSimilar::On);
        let mut conns = lock(&log).clone();
        conns.sort();
        assert!(conns.len() >= 2, "{conns:?}");
        // The second request went out only after the first one's answer.
        assert!(conns[1].0 >= conns[0].1, "two downloads overlapped");
    }

    fn rig() -> Rig {
        rig_with(Duration::ZERO, || true, true)
    }

    fn enable_ready(r: &Rig) -> SimilarStatus {
        similar_enable(r.h()).unwrap();
        r.wait("ready", |s| s.phase == Phase::Ready)
    }

    /// Ready, with `vectors` (hash -> vector) in the store and the fake encoder, built directly.
    fn ready_with(r: &Rig, vectors: &[(&str, Vec<f32>)]) {
        let mut store = EmbStore::load(&r.root(), test_spec());
        for (h, v) in vectors {
            store.put(h, v.clone());
        }
        let mut s = r.similar();
        s.phase = Phase::Ready;
        s.root = Some(r.root());
        s.store = Some(Arc::new(Mutex::new(store)));
        s.encoder = Some(Arc::new(Mutex::new(Box::new(Fake {
            calls: r.calls.clone(),
            sleep: Duration::ZERO,
        }) as Box<dyn Embedder>)));
    }

    fn refs(r: &Rig) -> Vec<Reference> {
        let st = r.e.app.state::<AppState>();
        lock(&st.open).as_ref().unwrap().lib.data.references.clone()
    }

    #[test]
    fn off_by_default_and_search_refused() {
        let r = rig();
        assert_eq!(r.status().phase, Phase::Off);
        assert_eq!(
            similar_by_text(r.h(), "x".into()),
            Err("FindSimilarOff".to_string())
        );
    }

    #[test]
    fn enable_with_installed_model_skips_download() {
        let r = rig();
        r.import(&["small.jpg", "p3_red.png", "rotated.jpg"]);
        enable_ready(&r);
        let s = r.wait("indexed", |s| s.phase == Phase::Ready && s.indexed == 3);
        assert_eq!((s.indexed, s.total, s.download_done), (3, 3, 0));
        assert_eq!(r.calls.load(Ordering::SeqCst), 3);
        assert_eq!(r.e.settings().find_similar, FindSimilar::On);
        assert!(embeddings_path(&r.root()).exists());
    }

    #[test]
    fn by_ref_excludes_self_and_maps_hashes() {
        let r = rig();
        r.import(&["small.jpg", "p3_red.png"]);
        let base = refs(&r);
        let (a, c) = (base[0].clone(), base[1].clone());
        // Import never makes two references with one hash (a same-hash file becomes
        // `report.duplicates`), so only a hand-edited library.json reaches this (C4): build it.
        let mut b = a.clone();
        b.id = "twin".into();
        {
            let st = r.e.app.state::<AppState>();
            lock(&st.open)
                .as_mut()
                .unwrap()
                .lib
                .data
                .references
                .push(b.clone());
        }
        ready_with(&r, &[(&a.hash, at_cos(1.0, 1)), (&c.hash, at_cos(0.9, 2))]);
        let from_c = similar_by_ref(r.h(), c.id.clone()).unwrap();
        let ids: Vec<&str> = from_c.iter().map(|h| h.id.as_str()).collect();
        assert!(
            ids.contains(&a.id.as_str()) && ids.contains(&"twin"),
            "{ids:?}"
        );
        assert!(!ids.contains(&c.id.as_str()));
        let from_a = similar_by_ref(r.h(), a.id.clone()).unwrap();
        assert_eq!(from_a[0].id, "twin");
        assert!((from_a[0].score - 1.0).abs() < 1e-5);
        assert!(from_a.iter().all(|h| h.id != a.id));
    }

    #[test]
    fn load_failure_turns_off() {
        let r = rig_with(Duration::ZERO, || true, false);
        similar_enable(r.h()).unwrap();
        let s = r.wait("error", |s| s.phase == Phase::Error);
        assert_eq!(s.error.as_deref(), Some(copy::CANT_START));
        assert_eq!(r.e.settings().find_similar, FindSimilar::Off);
        assert_eq!(
            similar_by_text(r.h(), "x".into()),
            Err("FindSimilarOff".to_string())
        );
    }

    #[test]
    fn no_avx2_turns_off() {
        let r = rig_with(Duration::ZERO, || false, true);
        similar_enable(r.h()).unwrap();
        let s = r.wait("error", |s| s.phase == Phase::Error);
        assert_eq!(s.error.as_deref(), Some(copy::NO_AVX2));
        assert_eq!(r.loads.load(Ordering::SeqCst), 0);
        assert_eq!(r.e.settings().find_similar, FindSimilar::Off);
    }

    #[test]
    fn remove_deletes_model_and_embeddings() {
        let r = rig();
        r.import(&["small.jpg"]);
        enable_ready(&r);
        r.wait("indexed", |s| s.indexed == 1);
        assert!(embeddings_path(&r.root()).exists());
        let s = similar_remove_model(r.h()).unwrap();
        assert!(!r.model.path().exists());
        assert!(!embeddings_path(&r.root()).exists());
        assert_eq!((s.phase, s.disk_bytes), (Phase::Off, 0));
        assert_eq!(r.e.settings().find_similar, FindSimilar::Off);
    }

    #[test]
    fn download_total_in_every_phase() {
        let r = rig();
        let total = SIGLIP_B16_Q8.total_bytes();
        assert_eq!(r.status().download_total, total);
        for p in [
            Phase::Off,
            Phase::Downloading,
            Phase::Verifying,
            Phase::Loading,
            Phase::Indexing,
            Phase::Paused,
            Phase::Ready,
            Phase::Error,
        ] {
            r.similar().phase = p;
            assert_eq!(r.status().download_total, total, "{p:?}");
        }
    }

    #[test]
    fn by_file_guards() {
        let r = rig();
        ready_with(&r, &[]);
        let dir = tempfile::tempdir().unwrap();
        // Sparse on most file systems: set_len writes nothing, and the guard reads nothing.
        let big = dir.path().join("big.jpg");
        fs::File::create(&big)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        let p = |p: &Path| p.to_string_lossy().into_owned();
        assert_eq!(similar_by_file(r.h(), p(&big)), Err("TooLarge".to_string()));
        let junk = dir.path().join("junk.jpg");
        fs::write(&junk, b"not an image").unwrap();
        assert_eq!(
            similar_by_file(r.h(), p(&junk)),
            Err("Unreadable".to_string())
        );
        assert_eq!(
            similar_by_file(r.h(), p(&dir.path().join("missing.png"))),
            Err("Unreadable".to_string())
        );
        // rotated.jpg is stored 64×48 with EXIF Orientation 6: its upright copy is the raw
        // pixels turned 90° clockwise, saved losslessly.
        let upright = dir.path().join("upright.png");
        image::open(fixture("rotated.jpg"))
            .unwrap()
            .rotate90()
            .to_rgb8()
            .save(&upright)
            .unwrap();
        let enc = r.similar().encoder.clone().unwrap();
        let a = file_vector(&enc, &fixture("rotated.jpg")).unwrap();
        let b = file_vector(&enc, &upright).unwrap();
        assert!(
            a.iter().zip(&b).all(|(x, y)| (x - y).abs() < 1e-4),
            "{a:?} vs {b:?}"
        );
        // And the fake really is orientation-sensitive, so the check means something.
        let sideways = dir.path().join("sideways.png");
        image::open(fixture("rotated.jpg"))
            .unwrap()
            .to_rgb8()
            .save(&sideways)
            .unwrap();
        let c = file_vector(&enc, &sideways).unwrap();
        assert!(a.iter().zip(&c).any(|(x, y)| (x - y).abs() > 1e-3));
    }

    #[test]
    fn index_on_any_change() {
        let r = rig();
        r.import(&["small.jpg", "p3_red.png", "rotated.jpg"]);
        let all = refs(&r);
        let root = r.root();
        let view = |refs: &[Reference]| Change {
            references: refs
                .iter()
                .map(|x| ReferenceView::new(&root, x.clone()).unwrap())
                .collect(),
            removed: vec![],
            taxonomy: None,
            created: None,
            made_partial: 0,
            links: None,
            boards: None,
            can_undo: true,
            can_redo: false,
        };
        // Ready with the third already embedded, and no encoder, so no pass drains the queue.
        ready_with(&r, &[(&all[2].hash, at_cos(1.0, 1))]);
        r.similar().encoder = None;
        // A fake import_bytes result, then a fake redo of the same import.
        on_change(&r.h(), &view(&all[..1]));
        on_change(&r.h(), &view(&all[1..2]));
        on_change(&r.h(), &view(&all[..2]));
        let mut queued = r.similar().pending.clone();
        queued.sort();
        let mut want = vec![all[0].hash.clone(), all[1].hash.clone()];
        want.sort();
        assert_eq!(queued, want);
        r.similar().pending.clear();
        on_change(&r.h(), &view(&all[2..]));
        assert!(r.similar().pending.is_empty());
    }

    #[test]
    fn mode_cutoffs() {
        let r = rig();
        r.import(&["small.jpg", "p3_red.png", "rotated.jpg"]);
        let all = refs(&r);
        let spec = test_spec();
        // Text embeds as axis 0: `all[0]` sits just above the text cut-off.
        // `all[2]` is the image query (axis 0); `all[1]` sits just below the image cut-off.
        ready_with(
            &r,
            &[
                (&all[0].hash, at_cos(spec.sim_min_text + 0.01, 3)),
                (&all[1].hash, at_cos(spec.sim_min_image - 0.01, 4)),
                (&all[2].hash, at_cos(1.0, 1)),
            ],
        );
        let text = similar_by_text(r.h(), "a cat".into()).unwrap();
        assert!(text.iter().any(|h| h.id == all[0].id), "{text:?}");
        let img = similar_by_ref(r.h(), all[2].id.clone()).unwrap();
        assert!(img.iter().all(|h| h.id != all[1].id), "{img:?}");
    }

    /// A second library at `<tmp>/<name>`, created and then left (create switches to it).
    fn other_library(r: &Rig, name: &str, imports: &[&str]) -> String {
        let path = Path::new(&r.e.lib).with_file_name(name);
        let p = path.to_string_lossy().into_owned();
        create_library(r.h(), p.clone(), false).unwrap();
        r.import(imports);
        p
    }

    #[test]
    fn switch_library_stops_indexer() {
        let r = rig_with(Duration::from_millis(150), || true, true);
        let b = other_library(&r, "libB", &["small.jpg", "p3_red.png"]);
        let a = r.e.lib.clone();
        open_library(r.h(), a.clone()).unwrap();
        r.import(&["small.jpg", "p3_red.png", "rotated.jpg"]);
        let a_root = r.root();
        similar_enable(r.h()).unwrap();
        r.wait("indexing A", |s| s.phase == Phase::Indexing);
        open_library(r.h(), b).unwrap();
        let a_file = embeddings_path(&a_root);
        let before = fs::read(&a_file).ok();
        let s = r.wait("B indexed", |s| {
            s.phase == Phase::Ready && s.indexed == 2 && s.total == 2
        });
        assert_eq!(s.indexed, 2);
        std::thread::sleep(Duration::from_millis(400));
        assert_eq!(
            fs::read(&a_file).ok(),
            before,
            "A's embeddings.bin was written after the switch"
        );
        assert!(embeddings_path(&r.root()).exists());
    }

    #[test]
    fn failed_open_keeps_old_indexer() {
        let r = rig_with(Duration::from_millis(150), || true, true);
        r.import(&["small.jpg", "p3_red.png", "rotated.jpg"]);
        similar_enable(r.h()).unwrap();
        r.wait("indexing", |s| s.phase == Phase::Indexing);
        let nowhere = tempfile::tempdir().unwrap();
        assert!(open_library(r.h(), nowhere.path().to_string_lossy().into_owned()).is_err());
        assert!(
            r.similar().indexer.is_some(),
            "the old library's indexer must keep running"
        );
        r.wait("A indexed", |s| s.phase == Phase::Ready && s.indexed == 3);
    }

    #[test]
    fn start_hook_restarts_after_switch() {
        let r = rig_with(Duration::from_millis(150), || true, true);
        r.import(&["small.jpg", "p3_red.png"]);
        ready_with(&r, &[]);
        assert!(r.similar().indexer.is_none());
        start_hook(&r.h());
        let run = {
            let s = r.similar();
            assert!(s.indexer.is_some());
            s.indexer_run
        };
        start_hook(&r.h());
        assert_eq!(
            r.similar().indexer_run,
            run,
            "a running indexer must not be replaced"
        );
        r.wait("indexed", |s| s.phase == Phase::Ready && s.indexed == 2);
    }

    #[test]
    fn demo_seed_is_indexed() {
        let r = rig();
        enable_ready(&r);
        let demo = Path::new(&r.e.lib).with_file_name("demo");
        let view = create_library(r.h(), demo.to_string_lossy().into_owned(), true).unwrap();
        let n = view.references.len();
        assert!(n > 0);
        let s = r.wait("demo indexed", |s| {
            s.phase == Phase::Ready && s.indexed == s.total
        });
        assert!(s.total > 0 && s.total <= n);
    }

    #[test]
    fn errors_are_copy_not_raw_text() {
        let r = rig();
        let raw = "RAW-detail-1234";
        let cases = [
            (
                Failure::Download(DlError::Network(raw.into())),
                copy::NETWORK,
            ),
            (Failure::Download(DlError::Http(503)), copy::HTTP),
            (
                Failure::Download(DlError::Checksum { path: raw.into() }),
                copy::CHECKSUM,
            ),
            (Failure::Download(DlError::Io(raw.into())), copy::IO),
            (
                Failure::Load(LoadError::Model(raw.into())),
                copy::CANT_START,
            ),
            (Failure::NoAvx2, copy::NO_AVX2),
            (Failure::Other(raw.into()), copy::UNKNOWN),
        ];
        for (f, want) in cases {
            let run = r.similar().run;
            record_failure(&r.h(), run, f);
            let s = r.status();
            assert_eq!(s.phase, Phase::Error);
            let e = s.error.unwrap();
            assert_eq!(e, want);
            assert!(!e.contains(raw) && !e.contains("503"));
        }
    }
}
