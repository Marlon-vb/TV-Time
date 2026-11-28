import { describe, expect, it } from "vitest";
import { regionFromLocale } from "../region";

describe("regionFromLocale", () => {
  it("reads a region from common locale shapes", () => {
    expect(regionFromLocale("en-US")).toBe("US");
    expect(regionFromLocale("en_GB")).toBe("GB");
    expect(regionFromLocale("zh-Hans-CN")).toBe("CN");
    expect(regionFromLocale("pt-BR")).toBe("BR");
  });

  it("ignores unicode extensions so a calendar tag is not a country", () => {
    expect(regionFromLocale("en-US-u-ca-gregory")).toBe("US");
  });

  it("falls back when the locale has no country", () => {
    expect(regionFromLocale("en")).toBe("US");
    expect(regionFromLocale("es-419")).toBe("US");
    expect(regionFromLocale("")).toBe("US");
    expect(regionFromLocale(null)).toBe("US");
    expect(regionFromLocale(undefined)).toBe("US");
  });
});
