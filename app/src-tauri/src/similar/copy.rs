//! The one error-copy table (R11). Every Find similar error the artist sees comes from here;
//! raw error text (network, I/O, ORT, HTTP codes) goes to stderr only.

use super::download::DlError;
use super::encoder::LoadError;

pub const NETWORK: &str = "Couldn't reach the download. Check your connection and try again.";
pub const HTTP: &str = "The download server didn't answer. Try again later.";
pub const CHECKSUM: &str = "The download didn't finish correctly. Try again.";
pub const IO: &str = "Couldn't save the model. Check free disk space.";
pub const CANT_START: &str = "Find similar couldn't start on this computer.";
pub const NO_AVX2: &str = "This computer's processor can't run Find similar.";
/// Plan 6 B1: the pinned ORT dylib is built for macOS 14.
pub const MACOS_14: &str = "Find similar needs macOS 14 or later.";
pub const UNKNOWN: &str = "Find similar ran into a problem. Try again.";

pub fn download(e: &DlError) -> &'static str {
    match e {
        DlError::Network(_) => NETWORK,
        DlError::Http(_) => HTTP,
        DlError::Checksum { .. } => CHECKSUM,
        DlError::Io(_) => IO,
        DlError::Cancelled => UNKNOWN,
    }
}

/// The ORT library, the VC++ runtime and the model files all read the same to the artist.
pub fn load(_e: &LoadError) -> &'static str {
    CANT_START
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_error_has_plain_copy() {
        let dl = [
            (DlError::Network("dns: no such host".into()), NETWORK),
            (DlError::Http(503), HTTP),
            (
                DlError::Checksum {
                    path: "onnx/x.onnx".into(),
                },
                CHECKSUM,
            ),
            (DlError::Io("os error 112".into()), IO),
            (DlError::Cancelled, UNKNOWN),
        ];
        for (e, want) in dl {
            assert_eq!(download(&e), want);
        }
        assert_eq!(
            load(&LoadError::Lib("LoadLibraryExW failed".into())),
            CANT_START
        );
        assert_eq!(load(&LoadError::Model("protobuf parse".into())), CANT_START);
    }
}
