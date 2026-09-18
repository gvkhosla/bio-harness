import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

/** Fixed local module files only. No caller paths, git commands, network or credentials. */
export function analysisIdentity() {
  const extension = extname(fileURLToPath(import.meta.url));
  const files = [
    "analysis-identity",
    "contracts",
    "replay",
    "cfps-policy",
    "cfps-evidence",
    "cfps-decision",
  ].map((name) => {
    const file = `${name}${extension}`;
    return {
      file,
      sha256: createHash("sha256")
        .update(readFileSync(new URL(file, import.meta.url)))
        .digest("hex"),
    };
  });
  return {
    analysisContract: "bio-harness.cfps-descriptive.v1",
    packageVersion: JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ).version as string,
    files,
    boundary:
      "Hashes of local module files at packet construction, not attested loaded bytecode or signed execution proof. Source TypeScript and compiled JavaScript have different hashes. Historical artifacts retain their own identity; no silent recomputation.",
  };
}
