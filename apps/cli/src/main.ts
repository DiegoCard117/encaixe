import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { run } from "./cli";

process.exitCode = await run(process.argv.slice(2), {
  // `pnpm cli` roda na raiz do repo; INIT_CWD é a pasta de onde o usuário chamou.
  readFile: (path) => readFile(resolve(process.env.INIT_CWD ?? ".", path), "utf8"),
  readStdin: async () => {
    process.stdin.setEncoding("utf8");
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    return text;
  },
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  // Windows não define LANG: cai no idioma do sistema.
  env: { ...process.env, LANG: process.env.LANG ?? Intl.DateTimeFormat().resolvedOptions().locale },
});
