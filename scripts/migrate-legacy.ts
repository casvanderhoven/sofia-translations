/**
 * One-time migration of the 2017 Sofia markup into content/.
 * Idempotent: regenerates the Euripides and Livy seed sections from scripts/fixtures.
 *
 *   pnpm migrate:legacy
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSection, serializeSection, validateSection } from "@sofia/core";
import YAML from "yaml";
import { buildSectionFromLegacy } from "./lib/build-section.ts";
import { parseElektra, parseLivyPollen } from "./lib/legacy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const content = path.join(repo, "content");
const fixtures = path.join(here, "fixtures");
const today = new Date().toISOString().slice(0, 10);

async function writeYaml(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, YAML.stringify(data), "utf8");
}

async function writeSection(file: string, text: string) {
  // Round-trip guard: what we write must parse back canonically without warnings.
  const { section, warnings } = parseSection(text);
  const errors = validateSection(section).filter((i) => i.level === "error");
  if (warnings.length) throw new Error(`${file}: unexpected warnings ${warnings.join("; ")}`);
  if (errors.length) throw new Error(`${file}: ${errors.map((e) => e.message).join("; ")}`);
  if (serializeSection(section) !== text)
    throw new Error(`${file}: not canonical after round trip`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function migrateElectra() {
  const html = await readFile(path.join(fixtures, "Elektra.html"), "utf8");
  const { sections } = parseElektra(html, 53);
  const authorDir = path.join(content, "euripides");
  const workDir = path.join(authorDir, "electra");
  const chapterDir = path.join(workDir, "chapters", "01-prologue");
  await writeYaml(path.join(authorDir, "author.yaml"), {
    name: "Euripides",
    nameOriginal: "Εὐριπίδης",
    dates: "c. 480–406 BC",
    blurb: "Athenian tragedian; eighteen of his plays survive.",
    order: 1,
  });
  await writeYaml(path.join(workDir, "work.yaml"), {
    title: "Electra",
    titleOriginal: "Ἠλέκτρα",
    lang: "grc",
    urnBase: "urn:cts:greekLit:tlg0006.tlg012.perseus-grc2",
    source: {
      edition:
        "Euripides, Euripidis Fabulae vol. 2, ed. Gilbert Murray, Oxford 1913 (Perseus perseus-grc2)",
      license: "CC BY-SA 4.0",
      url: "https://scaife.perseus.org/reader/urn:cts:greekLit:tlg0006.tlg012.perseus-grc2:1-53/",
    },
    description:
      "Electra, married off to a poor farmer, waits for her brother Orestes to return and avenge Agamemnon.",
    order: 1,
  });
  await writeYaml(path.join(chapterDir, "chapter.yaml"), {
    title: "Prologue",
    range: [1, 53],
    order: 1,
  });
  let k = 0;
  for (const legacy of sections) {
    k++;
    const first = legacy.units[0]!.n;
    const last = legacy.units[legacy.units.length - 1]!.n;
    const section = buildSectionFromLegacy({
      title: `Lines ${first}–${last}`,
      lang: "grc",
      form: "verse",
      urn: `urn:cts:greekLit:tlg0006.tlg012.perseus-grc2:${first}-${last}`,
      source: {
        edition: "Murray 1913 via Perseus (perseus-grc2)",
        license: "CC-BY-SA-4.0",
        retrieved: today,
      },
      units: legacy.units,
    });
    const file = path.join(
      chapterDir,
      "sections",
      `${String(k).padStart(2, "0")}-lines-${first}-${last}.md`,
    );
    await writeSection(file, serializeSection(section));
  }
  return k;
}

async function migrateLivy() {
  const src = await readFile(path.join(fixtures, "ab-urbe-condita-1-12.html.pm"), "utf8");
  const units = parseLivyPollen(src);
  const authorDir = path.join(content, "livy");
  const workDir = path.join(authorDir, "ab-urbe-condita");
  const chapterDir = path.join(workDir, "chapters", "1-12");
  await writeYaml(path.join(authorDir, "author.yaml"), {
    name: "Livy",
    nameOriginal: "Titus Livius",
    dates: "59 BC – AD 17",
    blurb: "Roman historian; author of the 142-book history of Rome from its foundation.",
    order: 2,
  });
  await writeYaml(path.join(workDir, "work.yaml"), {
    title: "Ab urbe condita",
    lang: "lat",
    urnBase: "urn:cts:latinLit:phi0914.phi001.perseus-lat2",
    source: {
      edition: "Livy, Ab urbe condita, Perseus Digital Library edition (perseus-lat2)",
      license: "CC BY-SA 4.0",
      url: "https://scaife.perseus.org/reader/urn:cts:latinLit:phi0914.phi001.perseus-lat2:1.12/",
    },
    description:
      "The history of Rome from its foundation. Book 1 covers the kings, from Aeneas to the expulsion of the Tarquins.",
    order: 1,
  });
  await writeYaml(path.join(chapterDir, "chapter.yaml"), {
    title: "Book 1, chapter 12",
    range: [1, 10],
    order: 112,
  });
  let k = 0;
  for (const unit of units) {
    k++;
    const section = buildSectionFromLegacy({
      title: `1.12.${unit.n}`,
      lang: "lat",
      form: "prose",
      urn: `urn:cts:latinLit:phi0914.phi001.perseus-lat2:1.12.${unit.n}`,
      source: { edition: "Perseus perseus-lat2", license: "CC-BY-SA-4.0", retrieved: today },
      units: [unit],
    });
    const file = path.join(chapterDir, "sections", `${unit.n.padStart(2, "0")}.md`);
    await writeSection(file, serializeSection(section));
  }
  return k;
}

const e = await migrateElectra();
const l = await migrateLivy();
console.log(
  `migrated ${e} Electra section(s) and ${l} Livy section(s) into ${path.relative(repo, content)}/`,
);
