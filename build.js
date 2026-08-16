const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const moduleNames = ["core", "relay", "firebase"];
const modules = moduleNames.map((name) => {
  const source = fs.readFileSync(path.join(root, "src", `${name}.js`), "utf8");
  return `"./${name}": function(module, exports, require) {\n${source}\n}`;
});

const runtime = [
  "const __x3Modules = {",
  modules.join(",\n"),
  "};",
  "const __x3Cache = {};",
  "function __x3Require(id) {",
  "  if (__x3Cache[id]) return __x3Cache[id].exports;",
  "  const factory = __x3Modules[id];",
  "  if (!factory) throw new Error(`Unknown bundled module: ${id}`);",
  "  const module = { exports: {} };",
  "  __x3Cache[id] = module;",
  "  factory(module, module.exports, __x3Require);",
  "  return module.exports;",
  "}",
].join("\n");

const mainSource = fs.readFileSync(path.join(root, "src", "main.js"), "utf8")
  .replace(/require\("\.\/(core|relay|firebase)"\)/g, '__x3Require("./$1")');

fs.writeFileSync(path.join(root, "main.js"), `${runtime}\n${mainSource}`);
