import type { ContentPart, Message } from "@opencode/ai";
import type { ImageResult } from "../src/types.js";
import { Media } from "@opencode/ai";
import { describe, expect, it } from "vitest";
import {
  isImagePart,
  normalizeAttachment,
  stripImagesAfterFailure,
  transformMessages,
} from "../src/transform.js";
import {
  PNG_BYTES,
  assistant,
  fixture,
  hasMedia,
  image,
  media,
  text,
  textOf,
  user,
} from "./helpers.js";

const lastText = (message: Message) => {
  const part = message.content.at(-1);
  if (part?.type !== "text") throw new Error("last part is not text");
  return part.text;
};

describe("isImagePart", () => {
  it.each<[string, ContentPart, boolean]>([
    ["png media", image(), true],
    ["uppercase image MIME", media("IMAGE/WEBP"), true],
    ["unsupported image MIME", media("image/gif"), true],
    ["pdf media", media("application/pdf"), false],
    ["audio media", media("audio/wav"), false],
    ["text", text("image/png"), false],
  ])("%s", (_name, part, expected) => {
    expect(isImagePart(part)).toBe(expected);
  });
});

describe("normalizeAttachment", () => {
  it("returns undefined for non-image parts", () => {
    expect(normalizeAttachment(text("x"))).toBeUndefined();
    expect(normalizeAttachment(media("application/pdf"))).toBeUndefined();
  });

  it("normalizes the MIME type and flags private headers", () => {
    const remote: ContentPart = {
      type: "media",
      media: Media.url("https://x.test/a.png", {
        mediaType: "Image/PNG",
        headers: { authorization: "secret" },
      }),
    };
    expect(normalizeAttachment(remote)).toMatchObject({
      mime: "image/png",
      requiresHeaders: true,
      source: { type: "url", url: "https://x.test/a.png" },
    });
    expect(normalizeAttachment(image())).toMatchObject({
      requiresHeaders: false,
      source: { type: "bytes" },
    });
  });
});

describe("transformMessages", () => {
  it("returns messages without images unchanged, by reference", async () => {
    const f = await fixture();
    const messages = [user([text("hi")]), assistant([text("hello")])];
    const result = await transformMessages(messages, f);
    expect(result[0]).toBe(messages[0]);
    expect(result[1]).toBe(messages[1]);
  });

  it("never touches images outside user messages", async () => {
    const f = await fixture();
    const reply = assistant([image()]);
    const [result] = await transformMessages([reply], f);
    expect(result).toBe(reply);
  });

  it("replaces images in place and keeps every other part, its order and metadata", async () => {
    const f = await fixture();
    const pdf = media("application/pdf");
    const audio = media("audio/wav");
    const original = user(
      [text("first"), image(), pdf, text("second"), audio, image()],
      { id: "msg_1", metadata: { original: true } },
    );
    const [result] = await transformMessages([original], f);

    expect(original.content[1].type).toBe("media");
    expect(result).not.toBe(original);
    expect(result.id).toBe("msg_1");
    expect(result.metadata).toEqual({ original: true });
    expect(result.content[0]).toBe(original.content[0]);
    expect(result.content[2]).toBe(pdf);
    expect(result.content[3]).toBe(original.content[3]);
    expect(result.content[4]).toBe(audio);
    expect(result.content[1]).toMatchObject({
      type: "text",
      text: expect.stringMatching(/^\nAttached image: .+[0-9a-f]{64}\.png\n$/),
      metadata: { attachment: "original", easyVision: true },
    });
    expect(result.content.filter(isImagePart)).toEqual([]);
  });

  it("gives guidance once, on the latest user message, with all of its images", async () => {
    const f = await fixture();
    const [result] = await transformMessages(
      [user([text("compare these"), image(), image(PNG_BYTES, "image/jpeg")])],
      f,
    );
    const guidance = lastText(result);
    expect(guidance).toContain("The user has shared 2 images.");
    expect(guidance).toContain("Use the `Vision_understand_image` tool");
    expect(guidance).toContain("User's request: compare these");
    expect(textOf(result).match(/Use the/g)).toHaveLength(1);
  });

  it("keeps older image turns neutral: paths only, no instructions", async () => {
    const f = await fixture();
    const result = await transformMessages(
      [
        user([image(), text("old request")]),
        assistant([text("old answer")]),
        user([image()]),
      ],
      f,
    );
    expect(result[0].content).toHaveLength(2);
    expect(textOf(result[0])).toContain("Attached image:");
    expect(textOf(result[0])).not.toContain("Use the");
    expect(lastText(result[2])).toContain("(analyze the image)");
  });

  it("only adds paths in neutral mode", async () => {
    const f = await fixture();
    const [result] = await transformMessages([user([image()])], {
      ...f,
      neutral: true,
    });
    expect(result.content).toHaveLength(1);
    expect(textOf(result)).toContain("Attached image:");
    expect(textOf(result)).not.toContain("Use the");
  });

  it("passes only the user's typed text to {userText}", async () => {
    const f = await fixture();
    const [result] = await transformMessages(
      [
        user([
          text('<skill_content name="review">\nSKILL BODY\n</skill_content>'),
          text("describe this"),
          {
            type: "text",
            text: "\n\nAttached file: notes.txt\n\nFILE BODY",
            metadata: { attachment: { name: "notes.txt" } },
          },
          text("and this"),
          text("Attached file: /tmp/shot.png"),
          image(),
        ]),
      ],
      f,
    );
    const guidance = lastText(result);
    expect(guidance).toContain("User's request: describe this\nand this");
    for (const leaked of ["SKILL BODY", "FILE BODY", "/tmp/shot.png"])
      expect(guidance).not.toContain(leaked);
    expect(textOf(result)).toContain("SKILL BODY");
    expect(textOf(result)).toContain("FILE BODY");
  });

  it("is stable when applied to its own output", async () => {
    const f = await fixture();
    const once = await transformMessages([user([text("x"), image()])], f);
    expect(await transformMessages(once, f)).toEqual(once);
  });

  it("drops its own earlier guidance if media is reintroduced", async () => {
    const f = await fixture();
    const [once] = await transformMessages([user([text("x"), image()])], f);
    const [twice] = await transformMessages(
      [{ ...once, content: [...once.content, image()] }],
      f,
    );
    expect(textOf(twice).match(/Use the/g)).toHaveLength(1);
    expect(textOf(twice).match(/Attached image:/g)).toHaveLength(1);
  });

  it("produces the same path on every pass", async () => {
    const f = await fixture();
    const first = await transformMessages([user([image()])], f);
    const second = await transformMessages([user([image()])], f);
    expect(textOf(second[0])).toBe(textOf(first[0]));
  });

  describe("failures", () => {
    it("replaces a failed image with its reason and reports the count", async () => {
      const f = await fixture();
      let calls = 0;
      const failures: [string, number][] = [];
      const [result] = await transformMessages(
        [user([text("keep me"), image(), image()])],
        {
          ...f,
          process: async (attachment): Promise<ImageResult> =>
            ++calls === 1
              ? f.process(attachment)
              : { ok: false, reason: "Cannot save" },
          onFailure: (reason, index) => failures.push([reason, index]),
        },
      );
      expect(result.content[0]).toEqual(text("keep me"));
      expect(hasMedia(result)).toBe(false);
      expect(textOf(result)).toContain(
        "Easy Vision attachment failure: Cannot save",
      );
      expect(textOf(result)).toContain(
        "1 attachment(s) could not be processed; 1 image(s) remain available",
      );
      expect(failures).toEqual([["Cannot save", 0]]);
    });

    it("gives no analysis instructions when every image failed", async () => {
      const f = await fixture();
      const [result] = await transformMessages([user([image()])], {
        ...f,
        process: async () => ({ ok: false, reason: "nope" }),
      });
      expect(textOf(result)).not.toContain("Use the");
      expect(lastText(result)).toContain(
        "1 attachment(s) could not be processed. Do not infer",
      );
    });

    it("hides the details of an unexpected processor error", async () => {
      const f = await fixture();
      const [result] = await transformMessages([user([image()])], {
        ...f,
        process: async () => {
          throw new Error("private bytes/URL");
        },
      });
      expect(hasMedia(result)).toBe(false);
      expect(textOf(result)).toContain("Unexpected image-processing failure");
      expect(textOf(result)).not.toContain("private bytes/URL");
    });
  });
});

describe("stripImagesAfterFailure", () => {
  it("replaces images in user messages and leaves everything else alone", () => {
    const plain = user([text("no images")]);
    const reply = assistant([image()]);
    const pdf = media("application/pdf");
    const [stripped, untouched, replyOut] = stripImagesAfterFailure([
      user([text("keep"), image(), pdf]),
      plain,
      reply,
    ]);
    expect(stripped.content[0]).toEqual(text("keep"));
    expect(stripped.content[1]).toMatchObject({
      type: "text",
      text: expect.stringContaining("attachment processing failed"),
    });
    expect(stripped.content[2]).toBe(pdf);
    expect(untouched).toBe(plain);
    expect(replyOut).toBe(reply);
  });
});
