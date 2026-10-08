// fuel-factors.js
//
// Turns fuel studies and DOE price reports into sourced figures for the fuel
// model (supabase/functions/_shared/fuel.ts). Gemini reads the PDF and must
// return, for every number, the exact sentence or table row it came from.
// Nothing it finds is used until a person checks it against the source and
// approves it.
//
// Needs add_fuel_factors.sql run first, and SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY in the env file
// (supabase/.env already has all three).
//
// Usage:
//   node --env-file=supabase/.env fuel-factors.js extract <pdf path or URL> [--date=YYYY-MM-DD] [--title="..."] [--dry-run]
//   node --env-file=supabase/.env fuel-factors.js list [--status=pending|approved|rejected|all]
//   node --env-file=supabase/.env fuel-factors.js approve <id> [<id> ...]
//   node --env-file=supabase/.env fuel-factors.js reject <id> [<id> ...] [--notes="why"]
//   node --env-file=supabase/.env fuel-factors.js add --key=jeepney.idle_liters_per_hour --value=1.4 \
//        --title="Own test, 2 jeepneys, Angeles City" --quote="Unit 1 used 0.7 L in 30 min idling" [--date=2026-10-08]
//   node --env-file=supabase/.env fuel-factors.js summary
//
// --dry-run on extract prints what Gemini found without saving anything (no
// Supabase keys needed). --date is when the figure applies; set it for
// price reports so the newest week replaces older ones.

// Not flash-lite: in testing it missed figures stated plainly in the text
// (e.g. the Baguio study's 17.32 riders) and its results varied run to run.
const GEMINI_MODEL = process.env.GEMINI_EXTRACT_MODEL || "gemini-3.5-flash";
// Inline PDFs share Gemini's 20 MB request limit with their base64 overhead.
const MAX_PDF_BYTES = 14 * 1024 * 1024;

// Must match the fuel_factors_known_key check in add_fuel_factors.sql.
// Ranges are sanity bounds: anything outside is almost certainly a misread
// (wrong unit, wrong vehicle, a table total) and is never saved.
const FACTORS = {
  "jeepney.km_per_liter": {
    unit: "km/L", min: 1.5, max: 20,
    describe: "Fuel economy of a traditional DIESEL jeepney (PUJ) in km per liter, measured on the road or on a drive cycle that includes stops. Not LPG, gasoline, electric or modern/e-jeepney units, and not constant-speed or steady-state tests (they overstate mileage in stop-and-go traffic).",
  },
  "tricycle.km_per_liter": {
    unit: "km/L", min: 8, max: 60,
    describe: "Fuel economy of a Philippine motorcycle-with-sidecar tricycle in km per liter.",
  },
  "car.km_per_liter": {
    unit: "km/L", min: 4, max: 30,
    describe: "Fuel economy of an ordinary private gasoline car (sedan/hatchback) in city driving, in km per liter.",
  },
  "jeepney.idle_liters_per_hour": {
    unit: "L/h", min: 0.3, max: 5,
    describe: "Fuel burned per hour while a jeepney, or a diesel engine of similar size (2.5-4.5 L light truck/van), idles with the vehicle stopped. Say which vehicle in context.",
  },
  "tricycle.idle_liters_per_hour": {
    unit: "L/h", min: 0.05, max: 1.5,
    describe: "Fuel burned per hour while a tricycle or small motorcycle engine idles.",
  },
  "jeepney.avg_riders": {
    unit: "passengers", min: 1, max: 40,
    describe: "OBSERVED average number of passengers actually on board a jeepney, as a count stated by the source. Not seating or design capacity, and do not convert a load-factor percentage into a count.",
  },
  "diesel.price_per_liter": {
    unit: "PHP/L", min: 30, max: 200,
    describe: "Retail pump price of diesel in Philippine pesos per liter. In regional DOE reports, use the row for Angeles City (Pampanga) only; if it shows a range, return the low and the high end as two findings.",
  },
  "gasoline.price_per_liter": {
    unit: "PHP/L", min: 30, max: 200,
    describe: "Retail pump price of regular/unleaded gasoline (RON 91) in Philippine pesos per liter. In regional DOE reports, use the row for Angeles City (Pampanga) only; if it shows a range, return the low and the high end as two findings.",
  },
};

const SYSTEM_PROMPT = `
You extract fuel figures from a document for a jeepney app in Angeles City, Pampanga, Philippines.

Find every figure in the document that matches one of these keys:
${Object.entries(FACTORS).map(([key, f]) => `- ${key} (${f.unit}): ${f.describe}`).join("\n")}

Rules:
- Only report numbers the document itself states. Never estimate, average, or derive a figure from other figures.
- "quote" must be copied word for word from the document: the sentence or table row containing the number.
- "stated_value" and "stated_unit" are the number and unit exactly as the document prints them.
- "value" is that number in the key's unit. Only convert when the document's unit is a plain unit change (e.g. L/100 km to km/L, gallons to liters); otherwise value equals stated_value.
- "page" is the page number printed on or shown for the page, or null if unknown.
- "context" says briefly what was measured (vehicle, engine, test conditions, location, year).
- If the document reports several separate measurements for the same key, return each one.
- If nothing in the document matches, return an empty findings list. Returning nothing is better than a guess.
`.trim();

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    document_title: { type: "STRING" },
    document_date: { type: "STRING", nullable: true, description: "YYYY-MM-DD, YYYY-MM or YYYY the data or publication is from" },
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING", enum: Object.keys(FACTORS) },
          value: { type: "NUMBER" },
          stated_value: { type: "STRING" },
          stated_unit: { type: "STRING" },
          page: { type: "STRING", nullable: true },
          quote: { type: "STRING" },
          context: { type: "STRING" },
        },
        required: ["key", "value", "stated_value", "stated_unit", "quote", "context"],
      },
    },
  },
  required: ["document_title", "findings"],
};

// ---------- commands ----------

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const positional = rest.filter((a) => !a.startsWith("--"));

  switch (command) {
    case "extract":
      if (!positional[0]) usage("extract needs a PDF path or URL");
      return extract(positional[0]);
    case "list":
      return list(getCliArg("status", "pending"));
    case "approve":
    case "reject":
      if (!positional.length) usage(`${command} needs at least one id`);
      return review(command, positional);
    case "add":
      return addManual();
    case "summary":
      return summary();
    default:
      usage();
  }
}

async function extract(source) {
  const dryRun = process.argv.includes("--dry-run");
  const geminiKey = requireEnv("GEMINI_API_KEY");

  const { bytes, sourceRef } = await loadPdf(source);
  console.log(`Reading ${sourceRef} (${(bytes.length / 1024).toFixed(0)} KB) with ${GEMINI_MODEL}...`);

  const result = await askGemini(geminiKey, bytes);
  const title = getCliArg("title", null) || result.document_title || sourceRef;
  const dataDate = normalizeDate(getCliArg("date", null) || result.document_date);

  console.log(`\n${title}${dataDate ? ` (${dataDate})` : ""}`);
  if (!result.findings?.length) {
    console.log("No matching fuel figures found in this document.");
    return;
  }

  const accepted = [];
  for (const finding of result.findings) {
    const problem = checkFinding(finding);
    printFinding(finding, problem);
    if (!problem) accepted.push(finding);
  }

  console.log(`\n${accepted.length} of ${result.findings.length} finding(s) passed the checks.`);
  if (dryRun) {
    console.log("Dry run: nothing saved.");
    return;
  }
  if (!accepted.length) return;

  const db = supabaseRest();
  let saved = 0;
  for (const finding of accepted) {
    const [subject, factor] = finding.key.split(".");
    const spec = FACTORS[finding.key];
    // Re-running the same document must not stack duplicate rows.
    const existing = await db.get(
      `fuel_factors?select=id&subject=eq.${subject}&factor=eq.${factor}` +
        `&value=eq.${finding.value}&source_url=eq.${encodeURIComponent(sourceRef)}`,
    );
    if (existing.length) continue;

    await db.post("fuel_factors", {
      subject,
      factor,
      value: finding.value,
      unit: spec.unit,
      stated_value: finding.stated_value,
      stated_unit: finding.stated_unit,
      source_title: title,
      source_url: sourceRef,
      source_page: finding.page ?? null,
      source_quote: finding.quote,
      data_date: dataDate,
      notes: [finding.context, conversionNote(finding)].filter(Boolean).join(" | "),
      extracted_by: GEMINI_MODEL,
    });
    saved++;
  }

  console.log(`Saved ${saved} new row(s) as pending (${accepted.length - saved} already on file).`);
  console.log("Check each quote against the document, then: node --env-file=supabase/.env fuel-factors.js list");
}

async function list(status) {
  const db = supabaseRest();
  const filter = status === "all" ? "" : `&status=eq.${status}`;
  const rows = await db.get(`fuel_factors?select=*${filter}&order=subject,factor,created_at`);
  if (!rows.length) {
    console.log(`No ${status === "all" ? "" : status + " "}fuel factors.`);
    return;
  }
  for (const row of rows) {
    console.log(
      `\n${row.id}  [${row.status}]\n` +
        `  ${row.subject}.${row.factor} = ${row.value} ${row.unit}` +
        (row.stated_unit && row.stated_unit !== row.unit ? `  (source: ${row.stated_value} ${row.stated_unit})` : "") +
        `\n  ${row.source_title}${row.source_page ? `, p. ${row.source_page}` : ""}${row.data_date ? ` (${row.data_date})` : ""}` +
        `\n  ${row.source_url ?? ""}` +
        `\n  "${row.source_quote}"` +
        (row.notes ? `\n  note: ${row.notes}` : ""),
    );
  }
  if (status === "pending") {
    console.log("\nApprove the ones whose quote you found in the document: fuel-factors.js approve <id> ...");
  }
}

async function review(command, ids) {
  const db = supabaseRest();
  const status = command === "approve" ? "approved" : "rejected";
  const notes = getCliArg("notes", null);
  for (const id of ids) {
    const [current] = await db.get(`fuel_factors?select=notes&id=eq.${id}`);
    if (!current) {
      console.log(`${id}: not found`);
      continue;
    }
    const patch = { status, reviewed_at: new Date().toISOString() };
    // Appended, so the extraction context stays next to the review reason.
    if (notes) patch.notes = [current.notes, `${status}: ${notes}`].filter(Boolean).join(" | ");
    const [row] = await db.patch(`fuel_factors?id=eq.${id}`, patch);
    console.log(`${id}: ${status} (${row.subject}.${row.factor} = ${row.value} ${row.unit})`);
    if (status === "approved" && row.factor === "price_per_liter" && !row.data_date) {
      console.log("  warning: this price has no date, so a dated price will always replace it. Set data_date in the table.");
    }
  }
  if (status === "approved") {
    console.log("Edge functions pick this up within 10 minutes; the SQL impact panels immediately.");
  }
}

async function addManual() {
  const key = getCliArg("key", null);
  const value = Number(getCliArg("value", NaN));
  const title = getCliArg("title", null);
  const quote = getCliArg("quote", null);
  if (!key || !title || !quote || !Number.isFinite(value)) {
    usage("add needs --key, --value, --title and --quote");
  }
  const finding = { key, value, stated_value: String(value), stated_unit: FACTORS[key]?.unit, quote };
  const problem = checkFinding(finding, { quoteMustContainValue: false });
  if (problem) {
    console.error(`Not saved: ${problem}`);
    process.exit(1);
  }

  const [subject, factor] = key.split(".");
  const [row] = await supabaseRest().post("fuel_factors", {
    subject,
    factor,
    value,
    unit: FACTORS[key].unit,
    stated_value: String(value),
    source_title: title,
    source_url: getCliArg("url", null),
    source_quote: quote,
    data_date: normalizeDate(getCliArg("date", null)),
    extracted_by: "manual",
  });
  console.log(`Saved ${row.id} as pending: ${key} = ${value} ${FACTORS[key].unit}. Approve it once checked.`);
}

async function summary() {
  const rows = await supabaseRest().rpc("fuel_factor_summary");
  if (!rows.length) {
    console.log("No approved fuel factors yet; the app is using fuel.ts's built-in defaults.");
    return;
  }
  for (const r of rows) {
    const spread = Number(r.min_value) !== Number(r.max_value) ? ` (range ${r.min_value}-${r.max_value})` : "";
    console.log(`${r.subject}.${r.factor} = ${round(r.value)} ${FACTORS[`${r.subject}.${r.factor}`]?.unit ?? ""}${spread}, ${r.source_count} source(s)`);
  }
}

// ---------- checks ----------

// The model's output is a claim, not a fact. These catch the common
// failure modes mechanically; the person approving catches the rest by
// finding the quote in the document.
function checkFinding(finding, { quoteMustContainValue = true } = {}) {
  const spec = FACTORS[finding.key];
  if (!spec) return `unknown key ${finding.key}`;
  if (typeof finding.value !== "number" || !Number.isFinite(finding.value)) return "value is not a number";
  if (finding.value < spec.min || finding.value > spec.max) {
    return `${finding.value} ${spec.unit} is outside the plausible ${spec.min}-${spec.max} range`;
  }
  if (!finding.quote || finding.quote.trim().length < 10) return "no supporting quote";
  if (quoteMustContainValue) {
    const statedNumbers = numbersIn(finding.stated_value);
    if (!statedNumbers.length) return `stated value "${finding.stated_value}" has no number in it`;
    const quoteNumbers = numbersIn(finding.quote);
    const missing = statedNumbers.filter((n) => !quoteNumbers.includes(n));
    if (missing.length) return `stated value ${missing.join(", ")} does not appear in the quote`;
  }
  return null;
}

function conversionNote(finding) {
  const stated = Number(numbersIn(finding.stated_value)[0]);
  if (stated === finding.value) return "";
  return `converted from ${finding.stated_value} ${finding.stated_unit}; check the conversion`;
}

function numbersIn(text) {
  return (String(text ?? "").replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? [])
    .map((n) => String(Number(n)));
}

function printFinding(finding, problem) {
  const spec = FACTORS[finding.key];
  console.log(
    `\n${problem ? "SKIPPED" : "OK     "} ${finding.key} = ${finding.value} ${spec?.unit ?? ""}` +
      (finding.stated_unit && finding.stated_unit !== spec?.unit ? `  (source: ${finding.stated_value} ${finding.stated_unit})` : "") +
      (finding.page ? `, p. ${finding.page}` : "") +
      `\n        "${finding.quote}"` +
      (finding.context ? `\n        ${finding.context}` : "") +
      (problem ? `\n        reason: ${problem}` : ""),
  );
}

// ---------- Gemini ----------

async function askGemini(apiKey, pdfBytes) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          parts: [
            { inlineData: { mimeType: "application/pdf", data: Buffer.from(pdfBytes).toString("base64") } },
            { text: "Extract the matching fuel figures from this document." },
          ],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) fail(`Gemini request failed (${res.status}): ${data?.error?.message ?? JSON.stringify(data)}`);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) fail(`Gemini returned no result: ${JSON.stringify(data?.candidates?.[0]?.finishReason ?? data)}`);
  try {
    return JSON.parse(text);
  } catch {
    fail(`Gemini returned invalid JSON:\n${text}`);
  }
}

async function loadPdf(source) {
  let bytes;
  let sourceRef;
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { headers: { "User-Agent": "Mozilla/5.0 (cAIabe fuel-factors)" } });
    if (!res.ok) fail(`Download failed (${res.status}) for ${source}`);
    bytes = new Uint8Array(await res.arrayBuffer());
    sourceRef = source;
  } else {
    const { readFile } = await import("node:fs/promises");
    const { basename } = await import("node:path");
    bytes = new Uint8Array(await readFile(source));
    sourceRef = basename(source);
  }

  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") {
    fail(`${sourceRef} is not a PDF (some sites return an HTML page instead). Download the PDF and pass the file path.`);
  }
  if (bytes.length > MAX_PDF_BYTES) {
    fail(`${sourceRef} is ${(bytes.length / 1048576).toFixed(1)} MB; the limit is 14 MB. Save only the relevant pages as a new PDF.`);
  }
  return { bytes, sourceRef };
}

// ---------- Supabase REST (service role) ----------

function supabaseRest() {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const call = async (method, path, body) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body && JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      const hint = text.includes("fuel_factor") && res.status === 404 ? " (did you run add_fuel_factors.sql?)" : "";
      fail(`Supabase ${method} ${path.split("?")[0]} failed (${res.status})${hint}: ${text}`);
    }
    return text ? JSON.parse(text) : [];
  };
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    patch: (path, body) => call("PATCH", path, body),
    rpc: (fn, args = {}) => call("POST", `rpc/${fn}`, args),
  };
}

// ---------- helpers ----------

// Accepts YYYY, YYYY-MM or YYYY-MM-DD (models often only know the year).
function normalizeDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}`;
}

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`Missing ${name}. Run this script with: node --env-file=supabase/.env fuel-factors.js ...`);
  return value;
}

function getCliArg(name, defaultValue) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : defaultValue;
}

function usage(message) {
  if (message) console.error(message + "\n");
  console.error(
    "Usage:\n" +
      "  node --env-file=supabase/.env fuel-factors.js extract <pdf path or URL> [--date=YYYY-MM-DD] [--title=...] [--dry-run]\n" +
      "  node --env-file=supabase/.env fuel-factors.js list [--status=pending|approved|rejected|all]\n" +
      "  node --env-file=supabase/.env fuel-factors.js approve <id> [<id> ...]\n" +
      "  node --env-file=supabase/.env fuel-factors.js reject <id> [<id> ...] [--notes=...]\n" +
      "  node --env-file=supabase/.env fuel-factors.js add --key=<subject.factor> --value=<n> --title=... --quote=... [--date=...] [--url=...]\n" +
      "  node --env-file=supabase/.env fuel-factors.js summary\n\n" +
      `Keys: ${Object.keys(FACTORS).join(", ")}`,
  );
  process.exit(1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main().catch((err) => fail(err?.stack ?? String(err)));
