"use client";

import { useEffect, useRef, useState } from "react";

export default function SignaturePad({ onSigned, signatureDataUrl }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [certified, setCertified] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = 160 * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = "#E6EAEF";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pos(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event) {
    event.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event) {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function confirm() {
    onSigned(canvasRef.current.toDataURL("image/png"));
  }

  if (signatureDataUrl) {
    return (
      <section className="bg-panel border border-pass/50 rounded-lg p-4">
        <p className="field-label mb-2">04 · Inspector sign-off</p>
        <p className="text-sm text-pass">Signed and locked.</p>
      </section>
    );
  }

  return (
    <section className="bg-panel border border-line rounded-lg p-4 space-y-3">
      <p className="field-label">04 · Inspector sign-off</p>

      <label className="flex gap-3 items-start text-sm text-bone leading-relaxed">
        <input
          type="checkbox"
          checked={certified}
          onChange={(e) => setCertified(e.target.checked)}
          className="mt-1 accent-[#F5A623]"
        />
        <span>
          I confirm I have personally inspected this equipment, reviewed the AI screening findings, and this record
          reflects my own judgement as the person carrying out the check.
        </span>
      </label>

      <div>
        <p className="field-label mb-1.5">Sign inside the box — finger or mouse</p>
        <canvas
          ref={canvasRef}
          className="w-full h-[160px] bg-void border border-dashed border-line rounded touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-ghost" onClick={clear}>
          Clear
        </button>
        <button type="button" className="btn-primary" disabled={!hasInk || !certified} onClick={confirm}>
          Confirm sign-off
        </button>
      </div>
    </section>
  );
}
