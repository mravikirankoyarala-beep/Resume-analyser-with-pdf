import React, { useState, useCallback, useRef } from 'react';

const MAX_RESUME_MB = 8;
const MAX_JD_MB = 2;

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

function ScoreDial({ score }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const tone =
    clamped >= 75 ? '#3FD6B0' : clamped >= 50 ? '#F2B705' : '#F2705C';

  return (
    <div className="dial">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="#232838"
          strokeWidth="10"
        />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 80 80)"
          style={{ transition: 'stroke-dashoffset 900ms ease, stroke 900ms ease' }}
        />
      </svg>
      <div className="dial-readout">
        <span className="dial-number" style={{ color: tone }}>
          {clamped}
        </span>
        <span className="dial-unit">/ 100</span>
      </div>
    </div>
  );
}

function UploadSlot({ label, hint, accept, file, onFile, inputId }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    if (files && files[0]) onFile(files[0]);
  };

  return (
    <div
      className={`slot ${dragOver ? 'slot-drag' : ''} ${file ? 'slot-filled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
    >
      <span className="slot-jack" aria-hidden="true" />
      <div className="slot-copy">
        <p className="slot-label">{label}</p>
        <p className="slot-hint">
          {file ? file.name : hint}
        </p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

export default function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);

  const canSubmit = resumeFile && jdFile && status !== 'loading';

  const handleResumeFile = useCallback((file) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Resume must be a PDF file.');
      return;
    }
    if (file.size > MAX_RESUME_MB * 1024 * 1024) {
      setErrorMsg(`Resume PDF must be under ${MAX_RESUME_MB}MB.`);
      return;
    }
    setErrorMsg('');
    setResumeFile(file);
  }, []);

  const handleJdFile = useCallback((file) => {
    const okType =
      file.type === 'text/plain' ||
      /\.(txt|md)$/i.test(file.name);
    if (!okType) {
      setErrorMsg('Job description must be a plain text (.txt or .md) file.');
      return;
    }
    if (file.size > MAX_JD_MB * 1024 * 1024) {
      setErrorMsg(`Job description file must be under ${MAX_JD_MB}MB.`);
      return;
    }
    setErrorMsg('');
    setJdFile(file);
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setStatus('loading');
    setErrorMsg('');
    setResult(null);
    try {
      const jobDescriptionText = await readTextFile(jdFile);
      if (!jobDescriptionText.trim()) {
        throw new Error('The job description file appears to be empty.');
      }

      const formData = new FormData();
      formData.append('resume', resumeFile);
      formData.append('jobDescription', jobDescriptionText);

      const res = await fetch('/api/review', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status}).`);
      }

      const data = await res.json();
      setResult(data);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong.');
      setStatus('error');
    }
  };

  const reset = () => {
    setResumeFile(null);
    setJdFile(null);
    setResult(null);
    setStatus('idle');
    setErrorMsg('');
  };

  return (
    <div className="page">
      <header className="masthead">
        <span className="eyebrow">Resume ↔ Role Fit Analyzer</span>
        <h1>Two documents in. One honest readout.</h1>
        <p className="sub">
          Feed in a resume and a job description. The analyzer returns a match
          score, a gap analysis, tailored bullet rewrites, and mock interview
          questions built from the gap — nothing else.
        </p>
      </header>

      <section className="console">
        <div className="slots">
          <UploadSlot
            inputId="resume-input"
            label="01 — Resume"
            hint="Drop a PDF, or click to browse"
            accept="application/pdf,.pdf"
            file={resumeFile}
            onFile={handleResumeFile}
          />
          <UploadSlot
            inputId="jd-input"
            label="02 — Job description"
            hint="Drop a .txt file, or click to browse"
            accept=".txt,.md,text/plain"
            file={jdFile}
            onFile={handleJdFile}
          />
        </div>

        {errorMsg && <p className="error-line">{errorMsg}</p>}

        <div className="console-actions">
          <button
            className="run-btn"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {status === 'loading' ? 'Analyzing…' : 'Run analysis'}
          </button>
          {(resumeFile || jdFile || result) && (
            <button className="reset-btn" onClick={reset} type="button">
              Clear
            </button>
          )}
        </div>
      </section>

      {status === 'loading' && (
        <div className="loading-block">
          <div className="pulse-bar" />
          <p>Reading the resume, comparing it against the role…</p>
        </div>
      )}

      {result && (
        <section className="readout">
          <div className="panel panel-score">
            <h2>Match score</h2>
            <ScoreDial score={result.matchScore?.score} />
            <p className="score-reason">{result.matchScore?.reasoning}</p>
          </div>

          <div className="panel">
            <h2>Gap analysis</h2>
            <ul className="gap-list">
              {(result.gapAnalysis || []).map((gap, i) => (
                <li key={i}>
                  <span className="gap-area">{gap.area}</span>
                  <span className="gap-detail">{gap.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2>Tailored bullet suggestions</h2>
            <ul className="bullet-list">
              {(result.tailoredBullets || []).map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2>Mock interview questions</h2>
            <ol className="question-list">
              {(result.mockInterviewQuestions || []).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <footer className="foot">
        <span>Powered by Google Gemini</span>
      </footer>
    </div>
  );
}
