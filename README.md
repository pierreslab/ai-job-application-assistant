# AI Job Application Assistant

A browser-local Next.js app that helps users rank jobs against their own resume and generate tailored resumes, cover letters, and application emails with Gemini AI.

Users bring their own Gemini API key and upload their own resume. The app parses the resume, generates a reusable Jake Gutierrez template-based LaTeX master resume, and stores the profile locally in the browser.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How It Works

- Paste your own Gemini API key in the setup panel.
- Upload a PDF or DOCX resume.
- Gemini extracts your profile and converts the resume into Jake Gutierrez's MIT-licensed LaTeX resume template.
- Add or import job postings, then run AI matching.
- Generate tailored resumes, cover letters, and application emails for saved jobs.

## Privacy Notes

- The Gemini API key is stored in browser `localStorage`.
- Avoid using a production API key on shared machines.
- Uploaded resumes and job text are sent to Gemini for parsing, matching, and generation.
- PDF compilation sends LaTeX to the external compiler configured in `src/lib/latexCompiler.ts`; self-host or replace it for sensitive documents.
- Opening a document in Overleaf sends that LaTeX to Overleaf.
- Generated history is stored locally in the browser.
- Do not commit populated job exports, resumes, generated documents, API keys, or `.env` files.

## Job Data

`public/jobs.json` and `public/job-bank.json` are committed as empty arrays. Keep public examples fictional and sanitized. For real job exports, use local-only filenames such as `public/jobs.local.json` or another ignored data source.

## Resume Template

Generated master resumes use Jake Gutierrez's resume template, based on [sb2nov/resume](https://github.com/sb2nov/resume), under the MIT license.

## Before Publishing Your Fork

- Revoke any API keys that were ever committed.
- Remove any personal resume data from git history if it was previously pushed.
- Keep `public/jobs.json` and `public/job-bank.json` sanitized or empty.
- Review generated files and browser storage before sharing screenshots or demos.
- Run `npm run lint` and `npm run build`.

## License

This project is released under the MIT License. The generated resume template uses Jake Gutierrez's MIT-licensed template attribution separately in `src/lib/masterResume.ts`.

## Scripts

```bash
npm run dev
npm run build
npm run lint
```
