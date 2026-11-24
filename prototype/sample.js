// Synthetic placeholder references. Every plate below is an authored stand-in,
// labelled as synthetic in the UI, and is replaced automatically once
// ../demo/manifest.json (the public-domain demo set) exists.
window.HORUS_SAMPLE = (() => {
  const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
  const t = (technique, operation, domain, state = "full", region) => ({ technique, operation, domain, state, region });

  const refs = [
    { id: "s-fog", title: "Figure in Fog", ar: 3 / 4,
      svg: svg(300, 400, `<defs><linearGradient id="fg" x2="0" y2="1"><stop offset="0" stop-color="#E9E9E5"/><stop offset=".62" stop-color="#A9ACA7"/><stop offset="1" stop-color="#3B3D3C"/></linearGradient></defs>
        <rect width="300" height="400" fill="url(#fg)"/><path d="M0 330 L300 312 L300 400 L0 400Z" fill="#2A2C2B"/>
        <path d="M60 318 L80 300 M110 315 L118 298" stroke="#2A2C2B" stroke-width="3"/>
        <ellipse cx="172" cy="214" rx="11" ry="13" fill="#111"/><path d="M158 230 Q172 222 186 230 L190 300 L182 300 L178 262 L174 316 L166 316 L164 262 L160 300 L152 300Z" fill="#111"/>`),
      tags: [t("Silhouette", "Differentiate", "Feature", "full", { x: .47, y: .49, w: .2, h: .32 }),
             t("Isolation in void", "Differentiate", "Space", "region", { x: .05, y: .05, w: .9, h: .38 }),
             t(null, "Infer", null, "partial")] },
    { id: "s-profile", title: "Cut-paper Profile", ar: 3 / 4,
      svg: svg(300, 400, `<rect width="300" height="400" fill="#EFE7D6"/><rect x="40" y="40" width="220" height="320" fill="none" stroke="#B9AE93" stroke-width="2"/>
        <path d="M120 300 L120 250 Q100 240 104 222 Q96 214 104 206 Q92 198 102 186 Q88 172 104 160 Q104 120 140 104 Q190 92 205 140 Q212 180 196 214 Q190 250 210 300Z" fill="#141414"/>`),
      tags: [t("Silhouette", "Differentiate", "Feature", "full", { x: .28, y: .24, w: .44, h: .52 }),
             t(null, "Group", null, "partial"),
             t("Center placement", "Differentiate", "Space", "full")] },
    { id: "s-poster", title: "Café Poster", ar: 2 / 3,
      svg: svg(300, 450, `<rect width="300" height="450" fill="#E8C547"/><rect x="0" y="290" width="300" height="160" fill="#B8352A"/>
        <path d="M150 450 L150 250 Q150 190 205 170 L300 160 L300 450Z" fill="#141414"/><path d="M175 120 L300 104 L300 150 L190 160Z" fill="#141414"/>
        <rect x="24" y="30" width="150" height="14" fill="#141414"/><rect x="24" y="52" width="96" height="10" fill="#141414"/>`),
      tags: [t("Color blocking", "Group", "Feature", "full"),
             t("Silhouette", "Differentiate", "Feature", "region", { x: .5, y: .22, w: .5, h: .78 }),
             t("Crop at the edge", "Infer", "Space", "region", { x: .78, y: .2, w: .22, h: .6 }),
             t(null, "Differentiate", null, "partial")] },
    { id: "s-wave", title: "Wave and Mountain", ar: 4 / 3,
      svg: svg(400, 300, `<rect width="400" height="300" fill="#E9E2CF"/><path d="M250 230 L285 170 L320 230Z" fill="#8E9AA6"/><path d="M276 186 L285 170 L294 186Z" fill="#fff"/>
        <path d="M0 300 L0 210 Q40 60 170 50 Q240 46 250 90 Q200 70 170 110 Q150 150 205 200 Q260 240 400 230 L400 300Z" fill="#1F3B63"/>
        <path d="M170 50 Q240 46 250 90 Q232 78 214 80 Q226 64 170 50Z" fill="#F4F1E8"/>`),
      tags: [t("Scale disparity", "Infer", "Semantic", "region", { x: .6, y: .54, w: .22, h: .26 }),
             t("Leading lines", "Sequence", "Space", "full"),
             t(null, "Infer", null, "partial")] },
    { id: "s-lamp", title: "Lamp-lit Head", ar: 3 / 4,
      svg: svg(300, 400, `<defs><radialGradient id="lg" cx=".34" cy=".42" r=".55"><stop offset="0" stop-color="#E6C69C"/><stop offset=".5" stop-color="#6B4E33"/><stop offset="1" stop-color="#121212"/></radialGradient></defs>
        <rect width="300" height="400" fill="#121212"/><ellipse cx="150" cy="180" rx="74" ry="96" fill="url(#lg)"/><path d="M110 270 Q150 300 196 268 L230 400 L70 400Z" fill="#1E1A16"/>
        <path d="M222 120 Q238 180 214 250" stroke="#E8D3B0" stroke-width="2.5" fill="none"/>`),
      tags: [t("Chiaroscuro", "Differentiate", "Feature", "full"),
             t("Rim light", "Differentiate", "Feature", "region", { x: .66, y: .26, w: .16, h: .4 }),
             t(null, "Sequence", null, "partial")] },
    { id: "s-street", title: "Street in Rain", ar: 4 / 3,
      svg: svg(400, 300, `<rect width="400" height="300" fill="#9A9D9E"/><path d="M0 300 L200 120 L400 300Z" fill="#6E7274"/>
        <path d="M0 0 L190 120 M400 0 L210 120 M0 300 L200 120 L400 300 M100 300 L200 120 M300 300 L200 120" stroke="#3F4345" stroke-width="2" fill="none"/>
        <g fill="#1B1B1B"><path d="M238 196 q12 -12 24 0z"/><rect x="249" y="196" width="3" height="22"/><path d="M262 202 q12 -12 24 0z"/><rect x="273" y="202" width="3" height="22"/><path d="M250 210 q12 -12 24 0z"/><rect x="261" y="210" width="3" height="24"/></g>`),
      tags: [t("Leading lines", "Sequence", "Space", "full"),
             t("Proximity clustering", "Group", "Grouping", "region", { x: .58, y: .58, w: .17, h: .22 }),
             t(null, "Differentiate", null, "partial")] },
    { id: "s-window", title: "Window Interior", ar: 3 / 4,
      svg: svg(300, 400, `<rect width="300" height="400" fill="#1D1D1C"/><rect x="90" y="70" width="130" height="210" fill="#EDEDE6"/><path d="M155 70 V280 M90 175 H220" stroke="#1D1D1C" stroke-width="5"/>
        <ellipse cx="150" cy="200" rx="13" ry="15" fill="#111"/><path d="M128 280 Q132 222 150 218 Q168 222 172 280Z" fill="#111"/>
        <path d="M90 280 L60 400 M220 280 L250 400" stroke="#2C2C2A" stroke-width="3"/>`),
      tags: [t("Frame within a frame", "Differentiate", "Space", "region", { x: .28, y: .16, w: .46, h: .56 }),
             t("Silhouette", "Differentiate", "Feature", "region", { x: .41, y: .5, w: .18, h: .22 }),
             t("Chiaroscuro", "Differentiate", "Feature", "full")] },
    { id: "s-pattern", title: "Rows with One Red", ar: 1,
      svg: svg(300, 300, `<rect width="300" height="300" fill="#ECEAE4"/>${Array.from({ length: 36 }, (_, i) => `<circle cx="${45 + (i % 6) * 42}" cy="${45 + Math.floor(i / 6) * 42}" r="13" fill="${i === 21 ? "#B8352A" : "#2B2B2B"}"/>`).join("")}`),
      tags: [t("Pattern break", "Differentiate", "Grouping", "region", { x: .55, y: .55, w: .16, h: .16 }),
             t("Common region", "Group", "Grouping", "full")] },
    { id: "s-vase", title: "Vase or Faces", ar: 1,
      svg: svg(300, 300, `<rect width="300" height="300" fill="#F2F2EF"/><path d="M95 30 H205 Q200 70 178 86 Q170 100 184 118 Q196 140 176 160 Q166 176 186 196 Q206 230 205 270 H95 Q94 230 114 196 Q134 176 124 160 Q104 140 116 118 Q130 100 122 86 Q100 70 95 30Z" fill="#141414"/>`),
      tags: [t("Figure-ground reversal", "Infer", "Space", "full"),
             t("Symmetry", "Group", "Grouping", "full"),
             t(null, "Group", null, "partial")] },
    { id: "s-inbox-1", title: "Untitled screenshot", ar: 1, svg: svg(10, 10, `<rect width="10" height="10" fill="#999"/>`), tags: [] },
    { id: "s-inbox-2", title: "Untitled screenshot", ar: 1, svg: svg(10, 10, `<rect width="10" height="10" fill="#777"/>`), tags: [] },
  ];

  const links = [
    { from: "s-fog", to: "s-window", why: "Both figures only read because the light behind them flattens everything else." },
    { from: "s-fog", to: "s-wave", why: "Tiny thing, huge field. Same loneliness, opposite medium." },
  ];

  const synonyms = {
    "Silhouette": ["backlit", "shadow shape", "outline", "cut-out"],
    "Chiaroscuro": ["moody", "spotlight", "shadow", "dramatic light", "low key"],
    "Rim light": ["backlight", "edge light", "halo"],
    "Isolation in void": ["empty space", "negative space", "alone", "minimal"],
    "Scale disparity": ["tiny", "huge", "small vs big", "scale"],
    "Leading lines": ["perspective", "vanishing point", "guide the eye", "converging"],
    "Color blocking": ["flat colour", "bold colour", "blocks"],
    "Pattern break": ["odd one out", "the one different", "anomaly"],
    "Figure-ground reversal": ["optical illusion", "two readings", "negative space"],
    "Frame within a frame": ["window", "doorway", "framing"],
    "Contextual metaphor": ["show one thing as another", "metaphor", "symbol"],
    "Crop at the edge": ["cropped", "cut off", "bleed"],
    "Gaze cue": ["looking at", "eye line", "where they look"],
  };

  return { refs, links, synonyms };
})();
