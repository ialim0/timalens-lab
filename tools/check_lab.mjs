// usage: node tools/check_lab.mjs lab.json   (prints one problem per line; exit 1 if any)
//   or:  ... | node tools/check_lab.mjs -    (the lab on stdin)
import { readFileSync } from "node:fs";
import { checkLab } from "../web/js/labcheck.js";

const source = process.argv[2] ?? "-";
const text = source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8");
let problems;
try {
  problems = checkLab(JSON.parse(text));
} catch (error) {
  problems = [`not JSON: ${error.message}`];
}
process.stdout.write(JSON.stringify(problems) + "\n");
process.exit(problems.length ? 1 : 0);
