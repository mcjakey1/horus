import "./fonts/fonts.css";
import "./styles.css";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { tauriApi } from "./api";
import { boot } from "./firstrun";

// Plan 3 Task 4: the dev-only scene harness. The DEV check is static, so release builds drop it.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("scene-demo"))
  void import("./graph/scene-demo").then((m) => m.runSceneDemo(document.body));
else void boot(document.body, tauriApi, getCurrentWebview());
