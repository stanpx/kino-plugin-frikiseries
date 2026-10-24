import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../sdk/validate.mjs";
import { createKino } from "../sdk/kino-shim.mjs";
import * as plugin from "../plugin.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "test", "fixtures.json");

test("Kino accepts the manifest and plugin exports", async () => {
  const r = await validate(root);
  assert.deepEqual(r.problems, []);
  assert.ok(r.ok);
});

test("search() works offline with recorded fixture", { skip: !existsSync(fixtures) && "record test/fixtures.json first" }, async () => {
  const r = await validate(root, { run: "search", args: ["zodiaco"], replay: fixtures });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.drops, []);
  assert.ok(r.output.items.length > 0);
});

test("home() returns valid categories and items", async () => {
  const env = createKino({
    id: "frikiseries",
    apiVersion: 5,
    capabilities: ["search", "home", "browse", "episodes", "resolve", "download"],
    hosts: ["www.frikiserie.com", "frikiserie.com", "ok.ru", "*.ok.ru"]
  });
  globalThis.kino = env.kino;

  const rows = await plugin.home();
  assert.ok(Array.isArray(rows), "home() should return an array of rows");
  assert.ok(rows.length > 0, "home() should return at least one row");
  assert.ok(rows.length <= 20, "home() should not exceed 20 rows");

  const firstRow = rows[0];
  assert.ok(firstRow.id, "row should have an id");
  assert.ok(firstRow.title, "row should have a title");
  assert.ok(Array.isArray(firstRow.items) && firstRow.items.length > 0, "row should have items");

  const item = firstRow.items[0];
  assert.ok(item.id, "item should have an id");
  assert.ok(item.title, "item should have a title");
  assert.ok(item.kind === "movie" || item.kind === "series", "item kind should be movie or series");
  assert.ok(item.ref, "item should have a ref");
});

test("search() finds matching anime and movies", async () => {
  const env = createKino({
    id: "frikiseries",
    apiVersion: 5,
    capabilities: ["search", "home", "browse", "episodes", "resolve", "download"],
    hosts: ["www.frikiserie.com", "frikiserie.com"]
  });
  globalThis.kino = env.kino;

  const results = await plugin.search({ q: "zodiaco" });
  assert.ok(Array.isArray(results), "search() should return an array");
  assert.ok(results.length > 0, "search('zodiaco') should find items");

  const hasSaintSeiya = results.some((it) => it.title.toLowerCase().includes("zodiaco"));
  assert.ok(hasSaintSeiya, "at least one result should mention zodiaco");
});

test("episodes() returns a single 'Maratón completo' episode for marathon series", async () => {
  const env = createKino({
    id: "frikiseries",
    apiVersion: 5,
    capabilities: ["episodes"]
  });
  globalThis.kino = env.kino;

  const sampleRef = JSON.stringify({
    kind: "series",
    slug: "los-caballeros-del-zodiaco-1986",
    title: "Los Caballeros del Zodiaco (1986)",
    video: "https://ok.ru/videoembed/14398744169198",
    irAListaVideo: false
  });

  const res = await plugin.episodes(sampleRef);
  assert.ok(res && Array.isArray(res.episodes), "episodes() should return { episodes }");
  assert.equal(res.episodes.length, 1, "should return exactly 1 marathon episode");
  assert.equal(res.episodes[0].season, 1);
  assert.equal(res.episodes[0].number, 1);
  assert.equal(res.episodes[0].title, "Maratón completo");
  assert.ok(res.episodes[0].ref, "episode should contain a playable ref");
});

test("episodes() throws not_found when video URL is empty or 'xxx'", async () => {
  const env = createKino({
    id: "frikiseries",
    apiVersion: 5,
    capabilities: ["episodes"]
  });
  globalThis.kino = env.kino;

  const emptyRef = JSON.stringify({
    kind: "series",
    slug: "serie-sin-video",
    title: "Serie Incompleta",
    video: "xxx",
    irAListaVideo: true
  });

  await assert.rejects(async () => {
    await plugin.episodes(emptyRef);
  }, /not_found|Video no disponible/);
});

test("resolve() extracts direct MP4 and alternatives from OKRU", async () => {
  const env = createKino({
    id: "frikiseries",
    apiVersion: 5,
    capabilities: ["resolve"],
    hosts: ["ok.ru", "*.ok.ru", "*.vkuser.net", "*.okcdn.ru", "*.mycdn.me"]
  });
  globalThis.kino = env.kino;

  const okruRef = JSON.stringify({
    url: "https://ok.ru/videoembed/14398744169198",
    title: "Los Caballeros del Zodiaco (1986)"
  });

  const stream = await plugin.resolve(okruRef);
  assert.ok(stream && stream.url, "resolve() should return a stream with url");
  assert.equal(stream.mime, "video/mp4");
  assert.ok(stream.url.startsWith("https://"), "stream url should be https");
  assert.ok(Array.isArray(stream.alternatives) && stream.alternatives.length > 0, "stream should have quality alternatives");
});
