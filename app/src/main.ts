import "./fonts/fonts.css";
import "./styles.css";
import { tauriApi } from "./api";
import { mountReference } from "./reference/view";

mountReference(document.body, tauriApi);
