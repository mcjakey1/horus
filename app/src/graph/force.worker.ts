// The Galaxy layout's worker (SPEC §10: never on the UI thread). It runs force.ts in batches of 10
// ticks, posts every batch, and stops when alpha < 0.01 or after 600 ticks. A new `start` or a
// `stop` abandons the run in progress.
import { createForce, type FromWorker, type ToWorker } from "./force";

// R7: a local cast instead of the WebWorker lib, which conflicts with DOM in the shared tsconfig.
const scope = self as unknown as {
  postMessage(m: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

let run = 0;

scope.onmessage = (e) => {
  const mine = ++run;
  if (e.data.type !== "start") return;
  const { input, run: runId } = e.data;
  const f = createForce(input);
  const ids = input.ids;
  const batch = () => {
    if (mine !== run) return; // superseded
    const done = f.step(10);
    const p = f.positions();
    const xy = new Float32Array(ids.length * 2);
    ids.forEach((id, i) => {
      xy[2 * i] = p[id].x;
      xy[2 * i + 1] = p[id].y;
    });
    scope.postMessage({ type: "tick", run: runId, ids, xy, alpha: f.alpha() }, [xy.buffer]);
    if (done) scope.postMessage({ type: "end", run: runId });
    else setTimeout(batch, 0); // yield, so a stop or a newer start is read between batches
  };
  batch();
};
