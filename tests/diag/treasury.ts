// Where national treasuries' money comes from and goes: node tests/run.mjs --script tests/diag/treasury.ts [perRegion] [days]
import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
import { ledgerTap } from '../../src/engine/ledger';
registerSystems();
const cpr = Number(process.argv[2] ?? 8), days = Number(process.argv[3] ?? 20);
const w = generateWorld(7, 'T', 0, { citizensPerRegion: cpr });
advance(w, 5 * DAY, false);
const flows: Record<string, number> = {};
ledgerTap.fn = (ref, why, amt, asset) => { if (ref.k === 'nat' && ref.id === 0 && asset === w.nations[0].cur) { const k = why.replace(/\(.*\)|\d+/g, '').trim().slice(0, 50); flows[k] = (flows[k] ?? 0) + amt; } };
advance(w, days * DAY, false);
const rows = Object.entries(flows).sort((a, b) => a[1] - b[1]);
for (const [k, v] of rows) console.log(((v / 100 / days).toFixed(0)).padStart(9), k);
console.log('treasury', ((w.nations[0].wallet[w.nations[0].cur] ?? 0) / 100).toFixed(0));
