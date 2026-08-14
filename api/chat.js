const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_MESSAGE_LENGTH = 8000;

function json(data, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

export default {
    async fetch(request) {
        if (request.method !== "POST") {
            return json({ error: "Method not allowed." }, 405);
        }

        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) {
            console.error("GEMINI_API_KEY is not configured.");
            return json({
                error: "The AI service is not configured yet. Add GEMINI_API_KEY in Vercel."
            }, 503);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: "The request body must be valid JSON." }, 400);
        }

        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) {
            return json({ error: "Please enter a message." }, 400);
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            return json({ error: "The message is too long." }, 413);
        }

        try {
            const geminiResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey
                    },
                    body: JSON.stringify({
                        contents: [{
                            role: "user",
                            parts: [{ text: message }]
                        }]
                    })
                }
            );

            const data = await geminiResponse.json().catch(() => ({}));
            if (!geminiResponse.ok) {
                console.error("Gemini API error", geminiResponse.status, data.error?.message);
                const googleStatus = data.error?.status || "UNKNOWN";
                const invalidKey = geminiResponse.status === 400 &&
                    /api key.*(not valid|invalid)/i.test(data.error?.message || "");
                let publicError = `Gemini rejected the request (${geminiResponse.status}: ${googleStatus}). Check the Vercel Function Logs.`;

                if (invalidKey) {
                    publicError = "Vercel's GEMINI_API_KEY was rejected. Create a new Gemini API key in Google AI Studio, update the Vercel environment variable, and redeploy.";
                } else if (geminiResponse.status === 400 && googleStatus === "FAILED_PRECONDITION") {
                    publicError = "Gemini requires billing or another project prerequisite. Check the key's project in Google AI Studio.";
                } else if (geminiResponse.status === 401 || geminiResponse.status === 403) {
                    publicError = `The Gemini key lacks permission (${geminiResponse.status}: ${googleStatus}). Check that it was created in Google AI Studio and can access the Gemini API.`;
                } else if (geminiResponse.status === 404) {
                    publicError = `The configured Gemini model is unavailable (${googleStatus}).`;
                } else if (geminiResponse.status === 429) {
                    publicError = "The AI service is busy or has reached its usage limit. Please try again later.";
                } else if (geminiResponse.status >= 500) {
                    publicError = "The Gemini service is temporarily unavailable. Please try again later.";
                }

                return json({
                    error: publicError
                }, geminiResponse.status >= 500 ? 502 : geminiResponse.status);
            }

            const reply = data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

            if (!reply) {
                return json({ error: "Gemini returned an empty response." }, 502);
            }

            return json({ reply });
        } catch (error) {
            console.error("Could not reach Gemini.", error);
            return json({ error: "The AI service is temporarily unavailable." }, 502);
        }
    }
};
