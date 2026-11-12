import { describe, expect, it } from "vitest";
import { suggestEnglishNames, suggestSurname, transliterateWord } from "./translit";

describe("English spelling suggestions", () => {
  it("common names use the usual passport spelling", () => {
    expect(suggestEnglishNames("علي حسين محمد")).toEqual({ given: "ALI", father: "HUSSEIN", grandfather: "MOHAMMED" });
    expect(transliterateWord("أحمد")).toBe("AHMED");
    expect(transliterateWord("مُحَمَّد")).toBe("MOHAMMED"); // diacritics ignored
  });
  it("other names are spelled letter by letter, upper case, never empty garbage", () => {
    expect(transliterateWord("بشار")).toBe("BSHAR");
    expect(transliterateWord("")).toBe("");
    expect(suggestEnglishNames("سالم")).toEqual({ given: "SALIM", father: "", grandfather: "" });
  });
  it("surnames with the article", () => {
    expect(suggestSurname("الجبوري")).toBe("ALJBWRY");
    expect(suggestSurname("")).toBe("");
  });
});
