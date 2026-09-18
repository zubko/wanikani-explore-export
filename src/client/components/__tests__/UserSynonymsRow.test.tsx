import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { click, mount, pressKey, settle, typeInto, type Mounted } from "@/test/render.tsx";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import {
  UserSynonymsRow,
  type UserSynonymsRowProps,
} from "@client/components/card-components/UserSynonymsRow.tsx";

const apiMock: ApiMock = installApiMock();

function props(overrides: Partial<UserSynonymsRowProps> = {}): UserSynonymsRowProps {
  return {
    subjectId: 2478,
    wanikaniSynonyms: [],
    subjectMeanings: [],
    localStudyMaterial: null,
    ...overrides,
  };
}

function renderStatic(overrides: Partial<UserSynonymsRowProps> = {}): string {
  return renderToStaticMarkup(<UserSynonymsRow {...props(overrides)} />);
}

async function addSynonym(view: Mounted, word: string): Promise<void> {
  click(view.findByLabel("+ Add Synonym"));
  typeInto(view.find("input"), word);
  pressKey({ node: view.find("input"), key: "Enter" });
  await settle();
}

describe("UserSynonymsRow view state", () => {
  it("shows a WaniKani synonym without a remove button", () => {
    const html = renderStatic({ wanikaniSynonyms: ["usa person"] });

    expect(html).toContain("usa person");
    expect(html).not.toContain("Remove usa person");
  });

  it("shows a local synonym with a remove button", () => {
    const html = renderStatic({
      wanikaniSynonyms: ["usa person"],
      localStudyMaterial: { meaning_synonyms: ["american"] },
    });

    expect(html).toContain("american");
    expect(html).toContain("Remove american");
    expect(html).not.toContain("Remove usa person");
  });

  it("shows a local synonym when there is no WaniKani one", () => {
    const html = renderStatic({ localStudyMaterial: { meaning_synonyms: ["american"] } });

    expect(html).toContain("Remove american");
  });

  it("shows a local synonym that WaniKani also has only once", () => {
    const html = renderStatic({
      wanikaniSynonyms: ["american"],
      localStudyMaterial: { meaning_synonyms: ["american"] },
    });

    expect(html.split("american")).toHaveLength(2);
    expect(html).not.toContain("Remove american");
  });

  it("shows only the add button when both lists are empty", () => {
    const html = renderStatic();

    expect(html).toContain("+ Add Synonym");
    expect(html).not.toContain("Remove");
  });

  it("shows the hint when one is given", () => {
    expect(renderStatic({ hint: "not in Anki" })).toContain("not in Anki");
    expect(renderStatic()).not.toContain("not in Anki");
  });
});

describe("UserSynonymsRow editing", () => {
  it("adds a synonym and sends only that word", async () => {
    apiMock.answerWith({ meaning_synonyms: ["american", "yank"] });
    const view = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );

    await addSynonym(view, "  yank  ");

    expect(apiMock.requests).toEqual([{ id: 2478, add_synonym: "yank" }]);
    expect(view.html()).toContain("Remove yank");
  });

  it("closes the input on Esc without sending anything", () => {
    const view = mount(<UserSynonymsRow {...props()} />);

    click(view.findByLabel("+ Add Synonym"));
    typeInto(view.find("input"), "yank");
    pressKey({ node: view.find("input"), key: "Escape" });

    expect(apiMock.requests).toEqual([]);
    expect(view.html()).toContain("+ Add Synonym");
    expect(view.html()).not.toContain("yank");
  });

  it("refuses a word that is already a synonym", async () => {
    const view = mount(
      <UserSynonymsRow
        {...props({
          wanikaniSynonyms: ["usa person"],
          localStudyMaterial: { meaning_synonyms: ["american"] },
        })}
      />
    );

    await addSynonym(view, "american");
    await addSynonym(view, "usa person");

    expect(apiMock.requests).toEqual([]);
  });

  it("refuses a synonym that differs only in case", async () => {
    const view = mount(
      <UserSynonymsRow
        {...props({
          wanikaniSynonyms: ["usa person"],
          localStudyMaterial: { meaning_synonyms: ["american"] },
        })}
      />
    );

    await addSynonym(view, "American");
    await addSynonym(view, "USA Person");

    expect(apiMock.requests).toEqual([]);
  });

  it("refuses a word that is already a meaning", async () => {
    const view = mount(
      <UserSynonymsRow
        {...props({ subjectMeanings: ["American Person", "Person From The USA"] })}
      />
    );

    await addSynonym(view, "american person");
    await addSynonym(view, "Person From The USA");

    expect(apiMock.requests).toEqual([]);
  });

  // WaniKani stores the meaning of 旧姓 decomposed: an e plus a combining accent.
  // Lowercasing alone does not match the precomposed form a user types.
  it("refuses a word that WaniKani stores with a combining accent", async () => {
    const decomposed = "Ne\u0301e";
    const precomposed = "n\u00e9e";
    const view = mount(<UserSynonymsRow {...props({ subjectMeanings: [decomposed] })} />);

    await addSynonym(view, precomposed);

    expect(decomposed.toLowerCase()).not.toBe(precomposed);
    expect(apiMock.requests).toEqual([]);
  });

  it("refuses a word that is an auxiliary meaning", async () => {
    const view = mount(
      <UserSynonymsRow {...props({ subjectMeanings: ["American Person", "US Citizen"] })} />
    );

    await addSynonym(view, "us citizen");

    expect(apiMock.requests).toEqual([]);
  });

  it("adds a word that is neither a synonym nor a meaning", async () => {
    apiMock.answerWith({ meaning_synonyms: ["yank"] });
    const view = mount(
      <UserSynonymsRow
        {...props({ wanikaniSynonyms: ["usa person"], subjectMeanings: ["American Person"] })}
      />
    );

    await addSynonym(view, "yank");

    expect(apiMock.requests).toEqual([{ id: 2478, add_synonym: "yank" }]);
  });

  it("removes only the clicked synonym", async () => {
    apiMock.answerWith({ meaning_synonyms: ["yank"] });
    const view = mount(
      <UserSynonymsRow
        {...props({ localStudyMaterial: { meaning_synonyms: ["american", "yank"] } })}
      />
    );

    click(view.findByLabel("Remove american"));
    await settle();

    expect(apiMock.requests).toEqual([{ id: 2478, remove_synonym: "american" }]);
    expect(view.html()).toContain("Remove yank");
    expect(view.html()).not.toContain("Remove american");
  });

  it("puts the old list back when the save fails", async () => {
    apiMock.failWith("Server error (500)");
    const view = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );

    await addSynonym(view, "yank");

    expect(view.html()).toContain("Remove american");
    expect(view.html()).not.toContain("Remove yank");
  });

  it("keeps the word of a failed add out of the next save", async () => {
    const failingAdd = apiMock.failLater(2478, "Server error (500)");
    const view = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );

    await addSynonym(view, "yank");
    click(view.findByLabel("Remove american"));
    await settle();

    expect(view.html()).toContain("Remove yank");
    expect(view.html()).not.toContain("Remove american");

    apiMock.answerWith(null);
    failingAdd.resolve();
    await settle();

    expect(apiMock.requests).toEqual([
      { id: 2478, add_synonym: "yank" },
      { id: 2478, remove_synonym: "american" },
    ]);
    expect(view.html()).not.toContain("Remove yank");
    expect(view.html()).not.toContain("Remove american");
  });

  it("keeps two cards of one subject on the same list", async () => {
    apiMock.answerWith({ meaning_synonyms: ["american", "yank"] });
    const first = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );
    const second = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );

    await addSynonym(first, "yank");

    apiMock.answerWith({ meaning_synonyms: ["american", "yank", "statesider"] });
    await addSynonym(second, "statesider");

    expect(apiMock.requests).toEqual([
      { id: 2478, add_synonym: "yank" },
      { id: 2478, add_synonym: "statesider" },
    ]);
    expect(first.html()).toContain("Remove statesider");
  });
});
