//! What runs after every change to the library or the taxonomy (CROSS-PLAN-AUDIT #11). Plan 2
//! registers nothing; Plan 5 registers its index trigger here.

use crate::commands::Change;
use std::sync::{Mutex, PoisonError};
use tauri::{AppHandle, Manager, Runtime};

type Hook = Box<dyn Fn(&Change) + Send + Sync>;

/// Per app, not a process-wide static, so parallel test apps never see each other's calls.
#[derive(Default)]
struct Hooks(Mutex<Vec<Hook>>);

pub fn register<R: Runtime>(app: &AppHandle<R>, hook: impl Fn(&Change) + Send + Sync + 'static) {
    app.manage(Hooks::default()); // does nothing once managed
    let hooks = app.state::<Hooks>();
    let mut list = hooks.0.lock().unwrap_or_else(PoisonError::into_inner);
    list.push(Box::new(hook));
}

/// Called once per mutating command and per import, after the state lock is released.
pub fn after_change<R: Runtime>(app: &AppHandle<R>, change: &Change) {
    if let Some(hooks) = app.try_state::<Hooks>() {
        for hook in hooks
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
        {
            hook(change);
        }
    }
}
