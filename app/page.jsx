"use client";

import { useEffect, useState } from "react";
import PhotoCapture from "@/components/PhotoCapture";
import MetadataForm from "@/components/MetadataForm";
import ResultsPanel from "@/components/ResultsPanel";
import SignaturePad from "@/components/SignaturePad";
import ReportSheet from "@/components/ReportSheet";
import HistoryView from "@/components/HistoryView";
import AnalyticsView from "@/components/AnalyticsView";
import { loadAudits, saveAudit, deleteAudit, clearAudits } from "@/lib/storage";
import {
  ANALYSIS_ABORTED_MESSAGE,
  ANALYSIS_UNREADABLE_MESSAGE,
  describeHttpFailure,
} from "@/lib/analysis-errors";

const EMPTY_METADATA = {
  inspector: "",
  cert: "",
  equipmentTag: "",
  site: "",
  category: "Forklift / telehandler",
  inspectionType: "Pre-use check (daily)",
  latitude: "",
  longitude: "",
  gpsAccuracy: null,
};

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeThumb(dataUrl, maxEdge = 320, quality = 0.7) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("thumb failed"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

const TABS = [
  { id: "inspect", label: "New inspection" },
  { id: "history", label: "Audit history" },
  { id: "analytics", label: "Fleet analytics" },
];

export default function Home() {
  const [view, setView] = useState("inspect");
  const [audits, setAudits] = useState([]);

  const [photo, setPhoto] = useState(null);
  const [metadata, setMetadata] = useState(EMPTY_METADATA);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);

  // Whatever this holds is what ReportSheet prints — live audit or a historical one.
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    setAudits(loadAudits());
  }, []);

  async function runAnalysis() {
    setAnalysing(true);
    setError("");
    setResult(null);
    setSignatureDataUrl(null);

    // The platform aborts the request at 60s with a gateway error page, not JSON.
    // Stop just short of that so the inspector gets a plain explanation instead of
    // whatever the browser throws when it tries to read HTML as JSON.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: photo.base64, mediaType: photo.mediaType, metadata }),
        signal: controller.signal,
      });

      // Read as text first: an infrastructure error (timeout, request too large) is
      // returned as an HTML page, and parsing that as JSON throws a browser-specific
      // message that tells the inspector nothing.
      const body = await response.text();
      let data = null;
      try {
        data = body ? JSON.parse(body) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(data?.error || describeHttpFailure(response.status));
      }
      if (!data?.result) {
        throw new Error(ANALYSIS_UNREADABLE_MESSAGE);
      }
      setResult(data.result);
    } catch (err) {
      if (err?.name === "AbortError") {
        setError(ANALYSIS_ABORTED_MESSAGE);
      } else {
        setError(err?.message || "Analysis failed. Check the connection and try again.");
      }
    } finally {
      clearTimeout(timeout);
      setAnalysing(false);
    }
  }

  async function handleSigned(dataUrl) {
    const signedAt = new Date().toLocaleString("en-GB");
    const hash = await sha256(
      JSON.stringify({ result, metadata, signedAt, image: photo?.base64?.slice(0, 512) })
    );
    const auditRef = `VYN-${hash.slice(0, 16).toUpperCase()}`;

    let photoThumb = null;
    try {
      photoThumb = await makeThumb(photo.dataUrl);
    } catch {
      // thumbnail is best-effort
    }

    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      auditRef,
      signedAt,
      metadata,
      result,
      photoThumb,
      signature: dataUrl,
    };

    setSignatureDataUrl(dataUrl);
    setReportData({ ...record, photoDataUrl: photo?.dataUrl || photoThumb });
    setAudits(saveAudit(record));
  }

  function printHistorical(record) {
    setReportData({ ...record, photoDataUrl: record.photoThumb });
    setTimeout(() => window.print(), 200);
  }

  function resetInspection() {
    setPhoto(null);
    setResult(null);
    setSignatureDataUrl(null);
    setError("");
    setReportData(null);
  }

  return (
    <main className="max-w-xl mx-auto px-4 pb-16">
      <header className="no-print pt-6 pb-4">
        <p className="font-display uppercase tracking-[0.22em] text-[11px] text-amber">
          VYNTAR · Make the invisible visible
        </p>
        <h1 className="font-display uppercase font-bold text-4xl leading-none mt-1">Inspect</h1>
        <p className="text-sm text-dim mt-2 leading-relaxed">
          AI pre-use hazard screen for lifting and work equipment. Referenced to LOLER 98 and PUWER 98. A screening
          aid for the competent person — not a thorough examination.
        </p>
      </header>

      {/* View tabs */}
      <nav className="no-print grid grid-cols-3 gap-1 bg-panel border border-line rounded-lg p-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            className={`font-display uppercase tracking-[0.08em] text-[13px] font-semibold rounded px-2 py-2.5 ${
              view === tab.id ? "bg-amber text-void" : "text-dim"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {view === "inspect" && (
        <div className="no-print space-y-4">
          <PhotoCapture
            photo={photo}
            onPhoto={(p) => {
              setPhoto(p);
              setResult(null);
              setSignatureDataUrl(null);
            }}
          />

          {photo && <MetadataForm metadata={metadata} onChange={setMetadata} />}

          {photo && !result && (
            <button type="button" className="btn-primary" disabled={analysing} onClick={runAnalysis}>
              {analysing ? "Analysing photograph…" : "03 · Run hazard analysis"}
            </button>
          )}

          {error && <p className="text-sm text-signal bg-panel border border-signal/40 rounded-lg p-3">{error}</p>}

          {result && (
            <>
              <ResultsPanel result={result} />
              <SignaturePad onSigned={handleSigned} signatureDataUrl={signatureDataUrl} />
            </>
          )}

          {signatureDataUrl && reportData && (
            <div className="space-y-3">
              <div className="bg-panel border border-line rounded-lg p-4">
                <p className="field-label mb-1">Audit reference</p>
                <p className="font-mono text-sm text-amber break-all">{reportData.auditRef}</p>
                <p className="text-[12px] text-dim mt-1">Signed {reportData.signedAt} · saved to audit history</p>
              </div>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                Print / save PDF report
              </button>
              <button type="button" className="btn-ghost" onClick={resetInspection}>
                Start new inspection
              </button>
            </div>
          )}
        </div>
      )}

      {view === "history" && (
        <div className="no-print">
          <HistoryView
            audits={audits}
            onPrint={printHistorical}
            onDelete={(id) => setAudits(deleteAudit(id))}
            onClearAll={() => setAudits(clearAudits())}
          />
        </div>
      )}

      {view === "analytics" && (
        <div className="no-print">
          <AnalyticsView audits={audits} />
        </div>
      )}

      {reportData && (
        <ReportSheet
          photoDataUrl={reportData.photoDataUrl}
          metadata={reportData.metadata}
          result={reportData.result}
          signatureDataUrl={reportData.signature}
          auditRef={reportData.auditRef}
          signedAt={reportData.signedAt}
        />
      )}
    </main>
  );
}
