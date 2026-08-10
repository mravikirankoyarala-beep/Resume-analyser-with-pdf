import formidable from 'formidable';
import fs from 'node:fs/promises';
import pdfParse from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Vercel: this route receives multipart/form-data, so the built-in
// JSON body parser must be turned off and formidable used instead.
export const config = {
  api: {
    bodyParser: false
  }
};

const MAX_RESUME_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_JD_CHARS = 20000;
const MAX_RESUME_CHARS = 20000;

// Strict response schema: Gemini is only allowed to return these four
// fields. Nothing else (e.g. general resume critique, formatting tips,
// salary guidance, etc.) is part of the contract.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    matchScore: {
      type: 'object',
      properties: {
        score: { type: 'integer' },
        reasoning: { type: 'string' }
      },
      required: ['score', 'reasoning']
    },
    gapAnalysis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          detail: { type: 'string' }
        },
        required: ['area', 'detail']
      }
    },
    tailoredBullets: {
      type: 'array',
      items: { type: 'string' }
    },
    mockInterviewQuestions: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['matchScore', 'gapAnalysis', 'tailoredBullets', 'mockInterviewQuestions']
};

const SYSTEM_INSTRUCTION = `You are a resume-to-job-description analysis engine embedded in an app.
You compare one resume against one job description and return ONLY the following four things,
matching the provided JSON schema exactly:

1. matchScore — an integer 0-100 estimating how well the resume fits the job description, plus
   a concise "reasoning" paragraph (3-5 sentences) explaining what drove that score: overlapping
   skills/experience, seniority alignment, and the biggest factors that pulled the score down.
2. gapAnalysis — a list of concrete gaps between the resume and the job description. Each item has
   a short "area" (e.g. "Cloud infrastructure", "Leadership scope") and a "detail" explaining what
   the job description asks for that the resume does not clearly demonstrate.
3. tailoredBullets — a list of rewritten or new resume bullet points, in the candidate's own
   experience, phrased to better match the job description's language and priorities. Each should
   be a single ready-to-paste bullet (no bullet characters, no headers).
4. mockInterviewQuestions — a list of interview questions an interviewer for this specific role
   would plausibly ask this specific candidate, based on both the resume and the job description
   (mix of role-specific technical/functional questions and questions that probe the gaps found above).

Do not return anything else: no general resume formatting feedback, no ATS tips, no salary
guidance, no cover letter, no unrelated commentary, and no text outside the JSON schema fields.
Base every claim strictly on the resume text and job description text provided — do not invent
companies, titles, or skills that are not present in the input.`;

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

async function parseForm(req) {
  const form = formidable({
    maxFileSize: MAX_RESUME_BYTES,
    multiples: false
  });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Use POST.');
  }

  if (!process.env.GEMINI_API_KEY) {
    return sendError(res, 500, 'Server is missing GEMINI_API_KEY.');
  }

  let fields, files;
  try {
    ({ fields, files } = await parseForm(req));
  } catch (err) {
    return sendError(res, 400, 'Could not read the uploaded files: ' + err.message);
  }

  const resumeFile = Array.isArray(files.resume) ? files.resume[0] : files.resume;
  const jobDescriptionRaw = Array.isArray(fields.jobDescription)
    ? fields.jobDescription[0]
    : fields.jobDescription;

  if (!resumeFile) {
    return sendError(res, 400, 'A resume PDF is required.');
  }
  if (!jobDescriptionRaw || !jobDescriptionRaw.trim()) {
    return sendError(res, 400, 'A job description is required.');
  }

  const mimetype = resumeFile.mimetype || '';
  const originalName = resumeFile.originalFilename || '';
  if (!mimetype.includes('pdf') && !originalName.toLowerCase().endsWith('.pdf')) {
    return sendError(res, 400, 'Resume must be a PDF file.');
  }

  let resumeText;
  try {
    const buffer = await fs.readFile(resumeFile.filepath);
    const parsed = await pdfParse(buffer);
    resumeText = (parsed.text || '').trim();
  } catch (err) {
    return sendError(res, 422, 'Could not extract text from that PDF: ' + err.message);
  } finally {
    fs.unlink(resumeFile.filepath).catch(() => {});
  }

  if (!resumeText) {
    return sendError(
      res,
      422,
      'No extractable text found in the PDF (it may be a scanned image). Please upload a text-based PDF.'
    );
  }

  const jobDescription = jobDescriptionRaw.trim().slice(0, MAX_JD_CHARS);
  const trimmedResume = resumeText.slice(0, MAX_RESUME_CHARS);

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4
      }
    });

    const prompt = `RESUME TEXT:
"""
${trimmedResume}
"""

JOB DESCRIPTION TEXT:
"""
${jobDescription}
"""

Analyze the fit between the resume and the job description and respond using the required JSON schema only.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return sendError(res, 502, 'The AI returned an unparsable response. Please try again.');
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return sendError(res, 502, 'Gemini request failed: ' + err.message);
  }
}
