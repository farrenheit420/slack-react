const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

async function buildCode() {
  const opts = {
    entryPoints: ["code.ts"],
    outfile: "code.js",
    bundle: true,
    platform: "neutral",
    target: "es2017",
    minify: !watch,
  };
  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    console.log("watching code.ts…");
  } else {
    await esbuild.build(opts);
    console.log("code.js built");
  }
}

async function buildUi() {
  const shell = fs.readFileSync(path.join(__dirname, "ui-shell.html"), "utf8");
  const opts = {
    entryPoints: ["ui.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    target: "es2017",
    minify: !watch,
  };

  const writeHtml = (js) => {
    const html = shell.replace("/* __UI_SCRIPT__ */", js);
    fs.writeFileSync(path.join(__dirname, "ui.html"), html);
    console.log("ui.html built");
  };

  if (watch) {
    const ctx = await esbuild.context({
      ...opts,
      plugins: [
        {
          name: "write-ui-html",
          setup(build) {
            build.onEnd(async (result) => {
              if (result.errors.length) return;
              const out = await esbuild.build({ ...opts, write: false });
              writeHtml(out.outputFiles[0].text);
            });
          },
        },
      ],
    });
    await ctx.watch();
    console.log("watching ui.ts…");
  } else {
    const result = await esbuild.build(opts);
    writeHtml(result.outputFiles[0].text);
  }
}

Promise.all([buildCode(), buildUi()]).catch((err) => {
  console.error(err);
  process.exit(1);
});
