import "./fonts/fonts.css";
import "./styles.css";
import { tauriApi } from "./api";
import { boot } from "./firstrun";

void boot(document.body, tauriApi);
