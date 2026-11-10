# Encaixe

Your resume, tailored to the job. Without making things up.

[Use now](https://diegocard117.github.io/encaixe/) · [Português](README.md)

## What it is

Encaixe tailors your resume to a job using a fact bank about your background.
An LLM selects, reorders and rewrites those facts.
The app checks the sources behind the generated text and flags violations for review.
It runs in your browser, with no account and with the LLM provider you choose.

## How to use it

1. **1 Fact bank:** choose one of three starting points. Use **Start from scratch** to fill in your profile and record real facts. Use **Import JSON** to load a saved bank. Use **Import an old resume** to paste text or select **Open PDF or TXT file**. Set up your provider with **Configure LLM**, then select **Extract facts**. Review each item and select **Confirm** before adding it. **Add to bank (N)** shows the confirmed count; pending or discarded items are left out. If the PDF has no selectable text, paste the text instead. To try the workflow, select **load example**.
2. **2 Job and match:** paste the vacancy into **Job description**. **Job fit** shows matching skills, **Gaps** and the most relevant facts. Only fill a gap if you have a real fact to record. Configure your LLM and select **Generate resume**.
3. **3 Review:** read the resume and check its sources and violations. Edit or remove problematic bullets, or select **Generate again**. **Export PDF** is available only with zero violations. In the print dialog, choose **Save as PDF**.

## How Encaixe checks for invented claims

The fact bank is the resume's only source. The LLM returns ids, and the app fills in the company, role and dates from your records. Each generated sentence cites its sources through `sourceFactIds`.

Code checks reject unknown or archived facts, facts used in the wrong context, and skills or numbers unsupported by the cited facts. A gap in the job requirements never becomes resume text. PDF export stays blocked until there are zero violations.

For example, a fact saying “reducing analysis time by 40%” supports “40%” in a bullet that cites it. Changing that to “60%” without another supporting source triggers a violation.

The checks have limits: they do not detect numbers written as words or technologies missing from the bank. Zero violations does not guarantee that every sentence is correct. Human review is still necessary.

## Fact bank

| Type                        | What to record                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Experience (`experience`)   | Company, role, dates and work context.                                                                        |
| Achievement (`achievement`) | Something you did or achieved within an experience, project or education record, with metrics when available. |
| Project (`project`)         | A personal, professional, academic or open source project.                                                    |
| Education (`education`)     | A degree, course or certification.                                                                            |
| Skill (`skill`)             | A skill or technology, with its category and alternative names.                                               |

See the [sample fact bank in JSON](docs/exemplo-banco-de-fatos.json).

## Choosing an LLM

- **Anthropic** (Claude) or **OpenAI**: paid per use. Generating a resume costs cents, depending on the model and text length.
- **Free options**: Gemini, Groq and OpenRouter offer free tiers. Check their terms: free plans may use your data.
- You don't need to know model names: after you paste your key, the app fetches the models your account can use and suggests one. If it is unavailable or overloaded, the app tries others from the list and tells you which one answered.
- **Local**: run a model on your PC with **Ollama**. With a local provider, nothing is sent to an external service. In **Configure LLM**, choose **OpenAI-compatible** and the **Ollama** preset. Start Ollama with `OLLAMA_ORIGINS` set to the app's origin so it can accept requests. For the published app, use `https://diegocard117.github.io`. A local model only works in that PC's browser, not on your phone.
  - Tested on an 8 GB GPU (RTX 3070): `ollama pull qwen3:8b`, with a larger context and a smaller context cache so it fits entirely on the GPU. Extracting a real resume took about 2 minutes. In PowerShell, then restart Ollama:

    ```powershell
    setx OLLAMA_ORIGINS "https://diegocard117.github.io"
    setx OLLAMA_CONTEXT_LENGTH 16384
    setx OLLAMA_FLASH_ATTENTION 1
    setx OLLAMA_KV_CACHE_TYPE q8_0
    ```

## Privacy

Your fact bank stays in the browser's `localStorage`. There is no account, project server or telemetry. By default, the API key stays only in the open tab. **Remember in this browser** lets you save it in this browser.

The job description, old resume text and facts used in LLM requests go directly to your chosen provider. Check that provider's terms before sending your data. With local Ollama, the destination is your own machine.

When importing a resume, the review in progress (including the resume text) stays in this browser until you add it to the bank or tap **Discard review**.

If you turn on Supabase sync (optional), the bank also goes to **your own** Supabase project, protected by sign-in and RLS; Encaixe has no access to it. See [docs/supabase.md](docs/supabase.md).

To wipe everything from this browser, use **Delete everything from this browser** under **Settings** › Danger zone in the fact bank (optionally also deleting your bank in Supabase).

Use **Export JSON** to back up your fact bank. Browser storage is no substitute for your own copy.

## Status

In development. Follow the [roadmap](https://github.com/users/DiegoCard117/projects/2).

- [x] Fact bank and generated draft schemas
- [x] Checker for invented claims
- [x] Browser playground for the checker
- [x] Light/dark themes and Portuguese/English interface
- [x] Fact-to-job matching: matching skills, gaps and the most relevant facts
- [x] Provider-independent LLM prompt and response validation, with resume rendering from real records
- [x] Browser fact bank editor with JSON import/export
- [x] Job matching, generation with your own key (Anthropic or an OpenAI-compatible API) and review of invented claims
- [x] PDF export through browser printing, enabled only with zero violations, in a format built for ATS and HR AI screening
- [x] GitHub Pages deployment on every push to `main`
- [x] Old resume import (pasted text, PDF or TXT): the LLM transcribes facts, the app flags numbers and skills missing from the source, and each fact enters the bank only after confirmation
- [x] CLI to validate a bank, check a draft and see job fit (`pnpm cli`)
- [x] Optional sync across devices in your own Supabase project ([setup guide, in Portuguese](docs/supabase.md))

### CLI

For scripts and automation, from the repository root (after `pnpm install`):

```powershell
pnpm cli validate docs/exemplo-banco-de-fatos.json
pnpm cli check bank.json draft.json
pnpm cli fit bank.json job.txt
```

`-` reads standard input, `--json` prints codes only for other programs and `--lang pt-BR|en` picks the language.
Exit code is 0 when everything is fine, 1 for an invalid bank or violations and 2 for usage or read errors.

## Development

Requires Node 22+ and pnpm. Install pnpm with `corepack enable` or `npm i -g pnpm`.

```powershell
pnpm install
pnpm --filter @encaixe/web dev
```

The app runs at http://localhost:5173. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, scripts and contribution rules. That guide is in Portuguese; issues and pull requests in English are welcome.

## Decisions

Product and architecture decisions are recorded in [docs/decisions.md](docs/decisions.md), in Portuguese.

## Support Encaixe

Encaixe is free and open source. If it helped you, consider supporting it:

- **Pix** (random key, Brazil only): `1ef18b8b-aa5f-42df-8bf4-19c16ba3b1dd`
- **GitHub Sponsors**: coming soon.

In the app, the "Support the project" link is in the footer.

## License

MIT.
