# AI Resume ↔ Role Fit Analyzer

Upload a resume (PDF) and a job description (plain text file). The app sends
both to Google Gemini and returns exactly four things:

1. **Match score** — a 0–100 score plus a short explanation of why.
2. **Gap analysis** — concrete gaps between the resume and the job description.
3. **Tailored bullet-point suggestions** — resume bullets rewritten to better match the role.
4. **Mock interview questions** — questions likely for this resume + this role.

The AI is instructed (via a locked system prompt and a strict JSON response
schema) to return **only** those four things — no generic resume-formatting
tips, ATS advice, cover letters, or other extras.

## Project structure

```
index.html          Vite entry HTML
src/
  main.jsx           React bootstrap
  App.jsx             Upload UI + results display
  App.css             Styling
api/
  review.js           Vercel serverless function: PDF parsing + Gemini call
package.json
vite.config.js
.env.example
```

## How it works

1. You select a resume PDF and a job description `.txt`/`.md` file in the browser.
2. The job description text is read client-side; the resume PDF is sent as a file.
3. `api/review.js` (a Vercel serverless function) extracts text from the PDF
   with `pdf-parse`, sends both texts to Gemini with a fixed prompt and a
   JSON response schema, and returns the parsed JSON.
4. The frontend renders the four sections.

## Local setup

You need two things running locally: the Vite dev server (frontend) and the
Vercel dev server (the `/api` serverless function), because `api/review.js`
only runs under Vercel's Node runtime.

```bash
npm install
npm install -g vercel      # one-time, if you don't already have it

# create your local env file
cp .env.example .env.local
# then edit .env.local and paste your real GEMINI_API_KEY

# terminal 1 — serves /api/review on http://localhost:3000
vercel dev

# terminal 2 — serves the React app on http://localhost:5173
# (vite.config.js proxies /api requests to localhost:3000)
npm run dev
```

Then open http://localhost:5173, upload a resume PDF and a job description
text file, and click **Run analysis**.

## Environment variable required

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Get a key at https://aistudio.google.com/apikey. Never commit a real key —
`.env`, `.env.local`, etc. are already git-ignored.

## Deploy on Vercel

1. Push this project to your own GitHub repository (or upload it directly to Vercel).
2. Go to https://vercel.com → **Add New Project**.
3. Import the repository.
4. Add the environment variable `GEMINI_API_KEY` in Project Settings → Environment Variables.
5. Click **Deploy**.

Vercel will build the Vite frontend and deploy `api/review.js` as a
serverless function automatically — no extra configuration needed.

## Notes and limits

- Resume PDFs must contain selectable text (not a scanned image) — the
  server extracts text with `pdf-parse`, it doesn't run OCR.
- Resume PDF uploads are capped at 8MB; job description files at 2MB.
- Only text-based `.txt` / `.md` files are accepted for the job description,
  per the app's intended flow of "paste your JD into a text file and upload it."
- The Gemini model used is `gemini-2.0-flash` (set in `api/review.js`) —
  swap the model string there if you'd prefer a different Gemini model.
