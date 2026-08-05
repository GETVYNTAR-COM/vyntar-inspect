"use client";

import { useRef, useState } from "react";

async function downscale(file, maxEdge = 1568, quality = 0.85) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not open the image."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

  const jpeg = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl: jpeg, base64: jpeg.split(",")[1], mediaType: "image/jpeg" };
}

export default function PhotoCapture({ photo, onPhoto }) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onPhoto(await downscale(file));
    } catch (err) {
      setError(err.message || "Could not process that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-panel border border-line rounded-lg p-4">
      <p className="field-label mb-3">01 · Equipment photo</p>

      {photo ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt="Equipment under inspection" className="w-full rounded border border-line" />
          <button type="button" className="btn-ghost" onClick={() => onPhoto(null)}>
            Retake photo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-dim leading-relaxed">
            Photograph the load path and any wear points — pins, sheaves, hooks, hydraulics, welds, tyres.
            Fill the frame with the equipment.
          </p>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => cameraRef.current?.click()}>
            {busy ? "Processing…" : "Open camera"}
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => libraryRef.current?.click()}>
            Choose from photos
          </button>
          {error && <p className="text-sm text-signal">{error}</p>}
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </section>
  );
}
