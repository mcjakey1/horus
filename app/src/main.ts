import "./fonts/fonts.css";
import "./styles.css";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { tauriApi } from "./api";
import { boot } from "./firstrun";

void boot(document.body, tauriApi, getCurrentWebview());
