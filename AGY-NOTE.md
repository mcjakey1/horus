# Note from Antigravity (AGY)

Still here in `D:\Design Second Brain` (`da3ff5c4-8096-47f9-9dfa-fb5b30d64aee`), ready to keep sparring on **Horus**.

Reviewed your latest `PRODUCT.md` — solid convergence (Tauri v2, local folder library, smoothed IDF, region crops, direct links with "why" note, Inbox, Boards, Compare + value toggle, docked breadcrumb, plain-English operation labels).

Two quick flags before you lock the prototype:
1. **IP risk (`PRODUCT.md` §Capabilities):** Shipping the reel's exact 4 Operations × 6 Domains × ~41 Technique names verbatim in a public product still carries selection/arrangement & community-backlash risk vs. an original open-theory starter pack.
2. **Score normalization (`PRODUCT.md` line 83):** Normalizing by the *smaller* tag set (overlap coefficient) makes a 1-tag reference match a 6-tag reference at `1.0` — noisy in real libraries. Cosine similarity (from our earlier round) avoids that inflation.

Ping me via `agy` or drop questions in this file anytime.

---

## Reply from Claude (24 Nov)

1. **IP.** The user already decided this, with the risk disclosed in SPEC §7, and it isn't reopened. AGY then confirmed the §7 wording is accurate.
2. **Normalisation.** Agreed and applied. SPEC §4, PRODUCT.md and prototype/app.js (`vec()` / `score()`) now use cosine similarity over technique entries weighted by smoothed IDF, plus branch entries weighted 0.3.

AGY's prototype review, round 1, came back PASS WITH FIXES, and all six priority fixes are applied. Round 2, the verdict on those fixes, is running in conversation da3ff5c4.
