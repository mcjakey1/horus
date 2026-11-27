//! The resumable, SHA-256-verified model download. The only network access in the app.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use sha2::{Digest, Sha256};

use super::model::{ModelFile, ModelSpec, OK_MARKER};

const CHUNK: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub enum DlEvent {
    Progress { done: u64, total: u64 },
    Verifying,
    Done,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DlError {
    Network(String),
    Http(u16),
    Checksum { path: String },
    Io(String),
    Cancelled,
}

/// The agent for `download`: User-Agent `Horus/<version>`, no other identifying headers,
/// no gzip (it would break Range offsets), and a per-read timeout so a stalled
/// connection ends as `Network` instead of hanging past a cancel.
pub fn agent() -> ureq::Agent {
    config().build().into()
}

fn config() -> ureq::config::ConfigBuilder<ureq::typestate::AgentScope> {
    ureq::Agent::config_builder()
        .user_agent(concat!("Horus/", env!("CARGO_PKG_VERSION")))
        .timeout_connect(Some(Duration::from_secs(30)))
        .timeout_per_read(Some(Duration::from_secs(30)))
        // HTTPS GET only (Global Constraints), also after a redirect.
        .https_only(true)
}

/// Downloads every missing file of `spec` into `dir`, file by file: resumes `<path>.part`
/// with `Range:`, renames into place only after the SHA-256 matches, writes `.ok` last.
pub fn download(
    spec: &ModelSpec,
    dir: &Path,
    client: &ureq::Agent,
    cancel: &AtomicBool,
    on: &mut dyn FnMut(DlEvent),
) -> Result<(), DlError> {
    let total = spec.total_bytes();
    let mut done = 0;
    for f in spec.files {
        if cancel.load(Ordering::Relaxed) {
            return Err(DlError::Cancelled);
        }
        let dest = dir.join(f.path);
        if !file_matches(&dest, f)? {
            // A marker from an earlier install must not vouch for a file being replaced now.
            match fs::remove_file(dir.join(OK_MARKER)) {
                Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(io_err(e)),
                _ => {}
            }
            fetch(spec, f, &dest, client, cancel, done, total, on)?;
        }
        done += f.size;
        on(DlEvent::Progress { done, total });
    }
    fs::write(dir.join(OK_MARKER), b"").map_err(io_err)?;
    on(DlEvent::Done);
    Ok(())
}

/// Brings one file into place: resume or restart its `.part`, verify, rename.
#[allow(clippy::too_many_arguments)]
fn fetch(
    spec: &ModelSpec,
    f: &ModelFile,
    dest: &Path,
    client: &ureq::Agent,
    cancel: &AtomicBool,
    before: u64,
    total: u64,
    on: &mut dyn FnMut(DlEvent),
) -> Result<(), DlError> {
    let part = part_path(dest);
    if let Some(parent) = part.parent() {
        fs::create_dir_all(parent).map_err(io_err)?;
    }
    let mut have = fs::metadata(&part).map_or(0, |m| m.len());
    if have > f.size {
        // Can't be right, and `Range: bytes=<have>-` would get 416 forever.
        fs::remove_file(&part).map_err(io_err)?;
        have = 0;
    }
    // A full `.part` (the app quit while hashing) is verified without a request.
    if have < f.size {
        let mut req = client.get(spec.url(f));
        if have > 0 {
            req = req.header("Range", format!("bytes={have}-"));
        }
        let resp = req.call().map_err(net_err)?;
        // ponytail: a 206 is trusted to start at `have`; a wrong Content-Range fails the SHA-256 below.
        let mut out = match resp.status().as_u16() {
            206 if have > 0 => OpenOptions::new().append(true).open(&part),
            200 => {
                have = 0;
                File::create(&part)
            }
            code => return Err(DlError::Http(code)),
        }
        .map_err(io_err)?;
        // Never read past the pinned size, so a wrong response can't fill the disk.
        let mut body = resp.into_body().into_reader().take(f.size - have);
        let mut buf = vec![0u8; CHUNK];
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err(DlError::Cancelled);
            }
            let n = match body.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                // Dropped mid-body: keep the `.part` for the next resume.
                Err(e) => return Err(DlError::Network(e.to_string())),
            };
            out.write_all(&buf[..n]).map_err(io_err)?;
            have += n as u64;
            on(DlEvent::Progress { done: before + have, total });
        }
        // Closed before hashing, renaming or deleting (Windows).
        drop(out);
    }
    on(DlEvent::Verifying);
    if sha256_file(&part)? != f.sha256 {
        // Wrong or truncated bytes: start clean next time.
        fs::remove_file(&part).map_err(io_err)?;
        return Err(DlError::Checksum { path: f.path.to_string() });
    }
    fs::rename(&part, dest).map_err(io_err)
}

/// Already in place with the pinned size and SHA-256.
fn file_matches(path: &Path, f: &ModelFile) -> Result<bool, DlError> {
    match fs::metadata(path) {
        Ok(m) if m.len() == f.size => Ok(sha256_file(path)? == f.sha256),
        Ok(_) => Ok(false),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(io_err(e)),
    }
}

fn sha256_file(path: &Path) -> Result<String, DlError> {
    let mut file = File::open(path).map_err(io_err)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; CHUNK];
    loop {
        match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => h.update(&buf[..n]),
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e) => return Err(io_err(e)),
        }
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn net_err(e: ureq::Error) -> DlError {
    match e {
        ureq::Error::StatusCode(code) => DlError::Http(code),
        e => DlError::Network(e.to_string()),
    }
}

fn io_err(e: io::Error) -> DlError {
    DlError::Io(e.to_string())
}

/// `<path>.part`, appended (not `with_extension`, which would eat `.onnx`).
fn part_path(dest: &Path) -> PathBuf {
    let mut s = dest.as_os_str().to_owned();
    s.push(".part");
    PathBuf::from(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::similar::model::{is_installed, ModelFile, OK_MARKER};
    use sha2::{Digest, Sha256};
    use std::collections::HashMap;
    use std::io::{BufRead, BufReader, Write};
    use std::net::{Shutdown, TcpListener, TcpStream};
    use std::sync::atomic::Ordering;
    use std::sync::{Arc, Mutex};

    const BIG: &str = "a.bin";
    const SMALL: &str = "onnx/b.bin";

    #[derive(Clone, Copy, PartialEq)]
    enum Mode {
        Normal,
        /// Send full headers, then only this many body bytes, then close.
        CutOff(usize),
        /// Answer 200 with the whole file even when asked for a Range.
        IgnoreRange,
        /// Same length, wrong bytes (an HTML page, a changed upstream file).
        Wrong,
        /// A correctly framed but short file.
        Truncated(usize),
    }

    #[derive(Clone, Debug)]
    struct Req {
        path: String,
        range: Option<String>,
        ua: Option<String>,
        accept_encoding: Option<String>,
    }

    struct Server {
        spec: &'static ModelSpec,
        files: HashMap<String, Vec<u8>>,
        mode: Arc<Mutex<Mode>>,
        log: Arc<Mutex<Vec<Req>>>,
    }

    impl Server {
        fn set(&self, m: Mode) {
            *self.mode.lock().unwrap() = m;
        }
        fn requests(&self) -> Vec<Req> {
            self.log.lock().unwrap().clone()
        }
    }

    fn fixture(len: usize, seed: u8) -> Vec<u8> {
        (0..len).map(|i| ((i * 31 + seed as usize) % 251) as u8).collect()
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    fn leak(s: String) -> &'static str {
        Box::leak(s.into_boxed_str())
    }

    /// A tiny HTTP/1.1 server on 127.0.0.1 serving two files (one in a subfolder).
    fn serve() -> Server {
        let files: HashMap<String, Vec<u8>> = [
            (BIG.to_string(), fixture(300_000, 7)),
            (SMALL.to_string(), fixture(1_000, 3)),
        ]
        .into();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let mode = Arc::new(Mutex::new(Mode::Normal));
        let log = Arc::new(Mutex::new(Vec::new()));
        {
            let (files, mode, log) = (files.clone(), mode.clone(), log.clone());
            std::thread::spawn(move || {
                for s in listener.incoming().flatten() {
                    handle(s, &files, *mode.lock().unwrap(), &log);
                }
            });
        }
        let model_files: Vec<ModelFile> = [BIG, SMALL]
            .iter()
            .map(|p| ModelFile {
                path: p,
                size: files[*p].len() as u64,
                sha256: leak(hex(&Sha256::digest(&files[*p]))),
            })
            .collect();
        let spec = Box::leak(Box::new(ModelSpec {
            id: "test-model",
            base: leak(format!("http://127.0.0.1:{port}")),
            repo: "test/repo",
            revision: "rev1",
            files: Box::leak(model_files.into_boxed_slice()),
            dim: 4,
            text_len: 8,
            pad_id: 1,
            lowercase: true,
            sim_min_image: 0.5,
            sim_min_text: 0.03,
        }));
        Server { spec, files, mode, log }
    }

    fn handle(mut s: TcpStream, files: &HashMap<String, Vec<u8>>, mode: Mode, log: &Mutex<Vec<Req>>) {
        let mut r = BufReader::new(s.try_clone().unwrap());
        let mut line = String::new();
        r.read_line(&mut line).unwrap();
        let path = line.split_whitespace().nth(1).unwrap_or("").to_string();
        let mut headers = HashMap::new();
        loop {
            let mut h = String::new();
            if r.read_line(&mut h).unwrap() == 0 || h == "\r\n" {
                break;
            }
            if let Some((k, v)) = h.split_once(':') {
                headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
            }
        }
        let range = headers.get("range").cloned();
        log.lock().unwrap().push(Req {
            path: path.clone(),
            range: range.clone(),
            ua: headers.get("user-agent").cloned(),
            accept_encoding: headers.get("accept-encoding").cloned(),
        });
        let key = path.split_once("/resolve/rev1/").map(|(_, k)| k).unwrap_or("");
        let Some(file) = files.get(key) else {
            let _ = s.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            let _ = s.shutdown(Shutdown::Write);
            return;
        };
        let mut body = file.clone();
        if mode == Mode::Wrong {
            body.iter_mut().for_each(|b| *b ^= 0x5a);
        }
        if let Mode::Truncated(n) = mode {
            body.truncate(n);
        }
        let start = match (&range, mode) {
            (Some(r), m) if m != Mode::IgnoreRange => r
                .strip_prefix("bytes=")
                .and_then(|r| r.strip_suffix('-'))
                .and_then(|n| n.parse::<usize>().ok()),
            _ => None,
        };
        let head = match start {
            Some(n) => format!(
                "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {n}-{}/{}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len() - 1,
                body.len(),
                body.len() - n
            ),
            None => format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()),
        };
        let slice = &body[start.unwrap_or(0)..];
        let sent = match mode {
            Mode::CutOff(n) => &slice[..n.min(slice.len())],
            _ => slice,
        };
        let _ = s.write_all(head.as_bytes());
        let _ = s.write_all(sent);
        let _ = s.flush();
        let _ = s.shutdown(Shutdown::Write);
    }

    fn test_agent() -> ureq::Agent {
        // The real agent's settings, minus any proxy from the environment; the local server is plain http.
        config().proxy(None).https_only(false).build().into()
    }

    fn run(srv: &Server, dir: &Path) -> (Result<(), DlError>, Vec<DlEvent>) {
        let mut ev = Vec::new();
        let r = download(srv.spec, dir, &test_agent(), &AtomicBool::new(false), &mut |e| ev.push(e));
        (r, ev)
    }

    fn no_parts(dir: &Path, srv: &Server) -> bool {
        srv.spec.files.iter().all(|f| !part_path(&dir.join(f.path)).exists())
    }

    #[test]
    fn fresh_download_verifies_and_marks() {
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        let (r, ev) = run(&srv, dir.path());
        assert_eq!(r, Ok(()));
        assert!(is_installed(dir.path(), srv.spec));
        assert!(no_parts(dir.path(), &srv));
        for f in srv.spec.files {
            assert_eq!(std::fs::read(dir.path().join(f.path)).unwrap(), srv.files[f.path]);
        }
        let total = srv.spec.total_bytes();
        assert_eq!(ev.last(), Some(&DlEvent::Done));
        assert!(ev.contains(&DlEvent::Verifying));
        assert!(ev.contains(&DlEvent::Progress { done: total, total }));
        assert!(ev.iter().all(|e| !matches!(e, DlEvent::Progress { done, .. } if *done > total)));
        let reqs = srv.requests();
        let ua = format!("Horus/{}", env!("CARGO_PKG_VERSION"));
        assert!(reqs.iter().all(|q| q.ua.as_deref() == Some(ua.as_str())), "{reqs:?}");
        assert!(reqs.iter().all(|q| q.accept_encoding.as_deref().is_none_or(|a| !a.contains("gzip"))));
        assert!(reqs.iter().all(|q| q.path.starts_with("/test/repo/resolve/rev1/")));
    }

    #[test]
    fn resume_after_cutoff() {
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        srv.set(Mode::CutOff(150_000));
        let (r, _) = run(&srv, dir.path());
        assert!(matches!(r, Err(DlError::Network(_))), "{r:?}");
        let part = part_path(&dir.path().join(BIG));
        let have = std::fs::metadata(&part).unwrap().len();
        assert!(have > 0 && have < 300_000, "{have}");
        assert!(!dir.path().join(OK_MARKER).exists());

        srv.set(Mode::Normal);
        let (r, _) = run(&srv, dir.path());
        assert_eq!(r, Ok(()));
        let big_reqs: Vec<_> = srv.requests().into_iter().filter(|q| q.path.ends_with(BIG)).collect();
        assert_eq!(big_reqs.last().unwrap().range.as_deref(), Some(format!("bytes={have}-").as_str()));
        assert!(is_installed(dir.path(), srv.spec));
        assert_eq!(std::fs::read(dir.path().join(BIG)).unwrap(), srv.files[BIG]);
    }

    #[test]
    fn server_ignores_range_restarts() {
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        srv.set(Mode::CutOff(100_000));
        assert!(matches!(run(&srv, dir.path()).0, Err(DlError::Network(_))));
        srv.set(Mode::IgnoreRange);
        let (r, ev) = run(&srv, dir.path());
        assert_eq!(r, Ok(()));
        assert!(srv.requests().iter().any(|q| q.range.is_some()));
        assert_eq!(std::fs::read(dir.path().join(BIG)).unwrap(), srv.files[BIG]);
        assert!(is_installed(dir.path(), srv.spec));
        let total = srv.spec.total_bytes();
        assert!(ev.iter().all(|e| !matches!(e, DlEvent::Progress { done, .. } if *done > total)));
    }

    #[test]
    fn bad_bytes_rejected() {
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        srv.set(Mode::Wrong);
        let (r, _) = run(&srv, dir.path());
        assert_eq!(r, Err(DlError::Checksum { path: BIG.to_string() }));
        assert!(no_parts(dir.path(), &srv));
        assert!(!dir.path().join(BIG).exists());
        assert!(!is_installed(dir.path(), srv.spec));
    }

    #[test]
    fn truncated_file_rejected() {
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        srv.set(Mode::Truncated(1_000));
        let (r, _) = run(&srv, dir.path());
        assert_eq!(r, Err(DlError::Checksum { path: BIG.to_string() }));
        assert!(no_parts(dir.path(), &srv));
        assert!(!is_installed(dir.path(), srv.spec));
    }

    #[test]
    fn cancel_stops_cleanly() {
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let r = download(srv.spec, dir.path(), &test_agent(), &cancel, &mut |e| {
            if matches!(e, DlEvent::Progress { .. }) {
                cancel.store(true, Ordering::Relaxed);
            }
        });
        assert_eq!(r, Err(DlError::Cancelled));
        let have = std::fs::metadata(part_path(&dir.path().join(BIG))).unwrap().len();
        assert!(have > 0 && have < 300_000, "{have}");
        assert!(!dir.path().join(OK_MARKER).exists());
        assert!(!is_installed(dir.path(), srv.spec));
        // Resumable: the next run picks up where it stopped.
        assert_eq!(run(&srv, dir.path()).0, Ok(()));
        assert!(srv.requests().iter().any(|q| q.range.as_deref() == Some(format!("bytes={have}-").as_str())));
        assert_eq!(std::fs::read(dir.path().join(BIG)).unwrap(), srv.files[BIG]);
    }

    #[test]
    fn installed_files_skipped() {
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(run(&srv, dir.path()).0, Ok(()));
        srv.log.lock().unwrap().clear();
        let (r, ev) = run(&srv, dir.path());
        assert_eq!(r, Ok(()));
        assert!(srv.requests().is_empty(), "{:?}", srv.requests());
        assert_eq!(ev.last(), Some(&DlEvent::Done));
    }

    #[test]
    fn cancel_on_installed_model_keeps_marker() {
        // AGY #2: nothing was replaced, so the model must stay installed.
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(run(&srv, dir.path()).0, Ok(()));
        let r = download(srv.spec, dir.path(), &test_agent(), &AtomicBool::new(true), &mut |_| {});
        assert_eq!(r, Err(DlError::Cancelled));
        assert!(is_installed(dir.path(), srv.spec));
    }

    #[test]
    fn full_part_is_verified_without_a_request() {
        // A complete `.part` (e.g. the app quit while hashing) must not send `Range: bytes=<size>-` (416 forever).
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        for f in srv.spec.files {
            let p = part_path(&dir.path().join(f.path));
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, &srv.files[f.path]).unwrap();
        }
        assert_eq!(run(&srv, dir.path()).0, Ok(()));
        assert!(srv.requests().is_empty());
        assert!(is_installed(dir.path(), srv.spec));
    }

    #[test]
    fn is_installed_needs_marker_and_sizes() {
        let srv = serve();
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(run(&srv, dir.path()).0, Ok(()));
        std::fs::remove_file(dir.path().join(OK_MARKER)).unwrap();
        assert!(!is_installed(dir.path(), srv.spec));
        std::fs::write(dir.path().join(OK_MARKER), b"").unwrap();
        std::fs::write(dir.path().join(SMALL), b"short").unwrap();
        assert!(!is_installed(dir.path(), srv.spec));
    }
}
