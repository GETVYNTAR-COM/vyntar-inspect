export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a vision-based hazard screening assistant for a UK competent person carrying out pre-use checks on lifting and work equipment (rigging, forklifts, MEWPs, cranes, slings, shackles, scaffolding, hydraulics).

Your findings are a SCREENING AID for a qualified inspector. They are not a statutory thorough examination under LOLER 1998 Reg 9 and must never be presented as one.

Analyse the photograph and respond with ONLY a valid JSON object — no markdown, no code fences, no commentary — matching exactly this shape:

{
  "equipment": { "type": string, "category": string, "model_estimate": string },
  "overall_status": "PASS" | "CONDITIONAL_PASS" | "CRITICAL_FAIL",
  "risk_score": number (0-100, higher = more dangerous),
  "confidence": number (0-100),
  "hazards": [
    {
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "category": "MECHANICAL" | "HYDRAULIC" | "STRUCTURAL" | "ELECTRICAL" | "PPE" | "OPERATIONAL",
      "description": string,
      "location": string,
      "regulation": string,
      "action": string
    }
  ],
  "compliant_controls": [string],
  "notes": string
}

Rules:
- Reference UK regulations where relevant: LOLER 1998, PUWER 1998, BS 7121, HSE ACOP L113 / L22. Do not cite OSHA.
- CRITICAL_FAIL means the equipment must be taken out of service immediately (missing retaining pins, structural cracks, active hydraulic leaks near load paths, severed strands, deformed hooks, etc.).
- CONDITIONAL_PASS means defects require action but do not demand immediate lockout.
- If the image is not equipment or is too unclear to assess, set overall_status to "CONDITIONAL_PASS", confidence below 30, empty hazards, and explain in notes.
- Be specific about visible physical evidence. Never invent defects that are not visible.`;

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel → Project → Settings → Environment Variables, then redeploy." },
        { status: 500 }
      );
    }

    const { imageBase64, mediaType, metadata } = await request.json();
    if (!imageBase64 || !mediaType) {
      return Response.json({ error: "No image received. Retake the photo and try again." }, { status: 400 });
    }

    const context = [
      metadata?.equipmentTag ? `Equipment ID/tag: ${metadata.equipmentTag}` : null,
      metadata?.category ? `Declared category: ${metadata.category}` : null,
      metadata?.inspectionType ? `Inspection type: ${metadata.inspectionType}` : null,
      metadata?.site ? `Job site: ${metadata.site}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              {
                type: "text",
                text: `Carry out the pre-use hazard screen on this equipment photograph.${context ? "\n\nInspector-supplied context:\n" + context : ""}`,
              },
            ],
          },
        ],
      }),
    });

    if (!apiResponse.ok) {
      const detail = await apiResponse.text();
      console.error("Anthropic API error", apiResponse.status, detail);
      return Response.json(
        { error: `Analysis service returned ${apiResponse.status}. Check the API key has credit, then try again.` },
        { status: 502 }
      );
    }

    const data = await apiResponse.json();
    const text = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const cleaned = text.replace(/```json|```/g, "").trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      return Response.json({ error: "Could not read the analysis result. Try again." }, { status: 502 });
    }

    const result = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    return Response.json({ result });
  } catch (err) {
    console.error("analyze route failed", err);
    return Response.json({ error: "Analysis failed. Check the connection and try again." }, { status: 500 });
  }
}
