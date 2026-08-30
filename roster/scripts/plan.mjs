import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRosterReconciliation } from '../lib/reconcile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const observedFlag = process.argv.indexOf('--observed');
const observedPath = observedFlag >= 0 ? process.argv[observedFlag + 1] : null;
const desired = JSON.parse(fs.readFileSync(path.join(root, 'roster/organs.json'), 'utf8'));
const observed = observedPath ? JSON.parse(fs.readFileSync(path.resolve(observedPath), 'utf8')) : [];
const rows = Array.isArray(observed) ? observed : observed.organs;
console.log(JSON.stringify(planRosterReconciliation(desired, rows ?? []), null, 2));
