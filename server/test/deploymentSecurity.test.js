import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("container deployment security", () => {
  it("runs the final application image as a non-root user", async () => {
    const dockerfile = await readFile(new URL("../../Dockerfile", import.meta.url), "utf8");
    const finalStage = dockerfile.slice(dockerfile.lastIndexOf("FROM "));

    expect(finalStage).toMatch(/^USER\s+(?!root\b)\S+/m);
  });

  it("does not expose the host Docker socket to the application", async () => {
    const compose = await readFile(new URL("../../docker-compose.yaml", import.meta.url), "utf8");

    expect(compose).not.toContain("/var/run/docker.sock");
    expect(compose).toMatch(/security_opt:\s*\n\s*- no-new-privileges:true/);
    expect(compose).toMatch(/cap_drop:\s*\n\s*- ALL/);
  });

  it("does not pre-start a local worker without its shared credential", async () => {
    const entrypoint = await readFile(
      new URL("../../scripts/docker-entrypoint.sh", import.meta.url),
      "utf8",
    );

    expect(entrypoint).toMatch(/if \[ -z "\$WEBHOOK_SECRET" \]; then\s+return 1/);
  });

  it("provides an isolated local integration compose profile", async () => {
    const compose = await readFile(
      new URL("../../docker-compose.local.yaml", import.meta.url),
      "utf8",
    );

    expect(compose).toMatch(/MONGODB_DATABASE:\s*ouj_chat/);
    expect(compose).toMatch(/replicaSet=ouj-rs/);
    expect(compose).toMatch(/cap_drop:\s*\n\s*- ALL/g);
    expect(compose).toMatch(/no-new-privileges:true/g);
    expect(compose).not.toMatch(/ports:\s*\n\s*- ["']?5174:/);
    expect(compose).not.toContain("/var/run/docker.sock");
    expect(compose).toMatch(/mem_limit:\s*400m/);
  });
});
