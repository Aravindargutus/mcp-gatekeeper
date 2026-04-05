import { readFileSync } from "fs";
import { HtmlReporter } from "../src/reporting/html.reporter.js";

const report = JSON.parse(readFileSync("reports/latest.json", "utf8"));
const reporter = new HtmlReporter("./reports");
await reporter.finalize(report);
console.log("HTML report generated at reports/latest.html");
