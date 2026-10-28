import esbuild from "esbuild";
const production = process.argv[2] === "production";
const ctx = await esbuild.context({entryPoints:["src/main.ts"], bundle:true, external:["obsidian","@codemirror/state","@codemirror/view"], format:"cjs", target:"es2020", outfile:"main.js", sourcemap:production ? false : "inline", minify:production, banner:{js:"/* Nor Cards | MIT License */"}});
if (production) { await ctx.rebuild(); await ctx.dispose(); } else { await ctx.watch(); }
