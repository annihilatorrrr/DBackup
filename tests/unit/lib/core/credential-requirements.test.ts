import { describe, it, expect } from "vitest";
import {
  ADAPTER_CREDENTIAL_REQUIREMENTS,
  getCredentialRequirements,
} from "@/lib/core/credential-requirements";

describe("getCredentialRequirements", () => {
  it("returns primary + ssh for standard database adapters (mysql)", () => {
    expect(getCredentialRequirements("mysql")).toEqual({
      primary: "USERNAME_PASSWORD",
      ssh: "SSH_KEY",
    });
  });

  it("returns primary + ssh for postgres", () => {
    expect(getCredentialRequirements("postgres")).toEqual({
      primary: "USERNAME_PASSWORD",
      ssh: "SSH_KEY",
    });
  });

  it("returns only ssh for sqlite (no primary credential needed)", () => {
    const req = getCredentialRequirements("sqlite");
    expect(req).toEqual({ ssh: "SSH_KEY" });
    expect(req?.primary).toBeUndefined();
  });

  it("returns SSH_KEY as primary for sftp", () => {
    expect(getCredentialRequirements("sftp")).toEqual({ primary: "SSH_KEY" });
  });

  it("returns ACCESS_KEY for s3-aws", () => {
    expect(getCredentialRequirements("s3-aws")).toEqual({ primary: "ACCESS_KEY" });
  });

  it("returns ACCESS_KEY for s3-r2", () => {
    expect(getCredentialRequirements("s3-r2")).toEqual({ primary: "ACCESS_KEY" });
  });

  it("returns SMTP for email", () => {
    expect(getCredentialRequirements("email")).toEqual({ primary: "SMTP" });
  });

  it("returns TOKEN for telegram", () => {
    expect(getCredentialRequirements("telegram")).toEqual({ primary: "TOKEN" });
  });

  it("returns undefined for an unknown adapter", () => {
    expect(getCredentialRequirements("unknown-adapter-xyz")).toBeUndefined();
  });
});

describe("ADAPTER_CREDENTIAL_REQUIREMENTS", () => {
  it("contains entries for all expected database adapters", () => {
    const dbAdapters = ["mysql", "mariadb", "postgres", "mongodb", "mssql", "redis", "sqlite"];
    for (const id of dbAdapters) {
      expect(ADAPTER_CREDENTIAL_REQUIREMENTS).toHaveProperty(id);
    }
  });

  it("contains entries for S3-family storage adapters", () => {
    const s3Adapters = ["s3-aws", "s3-generic", "s3-r2", "s3-hetzner"];
    for (const id of s3Adapters) {
      expect(ADAPTER_CREDENTIAL_REQUIREMENTS[id]).toEqual({ primary: "ACCESS_KEY" });
    }
  });
});
