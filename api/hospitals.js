const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;

function json(data, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

export default {
    async fetch(request) {
        if (request.method !== "GET") {
            return json({ error: "Method not allowed." }, 405);
        }

        if (request.headers.get("sec-fetch-site") === "cross-site") {
            return json({ error: "Cross-site requests are not allowed." }, 403);
        }

        const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
        if (!apiKey) {
            console.error("GOOGLE_MAPS_API_KEY is not configured.");
            return json({
                error: "Hospital search is not configured yet. Add GOOGLE_MAPS_API_KEY in Vercel."
            }, 503);
        }

        const url = new URL(request.url);
        const input = (url.searchParams.get("input") || "").trim();
        const sessionToken = (url.searchParams.get("sessionToken") || "").trim();

        if (input.length < MIN_QUERY_LENGTH) {
            return json({ suggestions: [] });
        }
        if (input.length > MAX_QUERY_LENGTH) {
            return json({ error: "The hospital search is too long." }, 400);
        }

        const requestBody = {
            input,
            includedPrimaryTypes: ["hospital"],
            includeQueryPredictions: false
        };
        if (sessionToken && sessionToken.length <= 64) {
            requestBody.sessionToken = sessionToken;
        }

        try {
            const placesResponse = await fetch(
                "https://places.googleapis.com/v1/places:autocomplete",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": apiKey,
                        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"
                    },
                    body: JSON.stringify(requestBody)
                }
            );

            const data = await placesResponse.json().catch(() => ({}));
            if (!placesResponse.ok) {
                console.error("Google Places error", placesResponse.status, data.error?.message);
                const googleStatus = data.error?.status || "UNKNOWN";
                let publicError = `Hospital search failed (${placesResponse.status}: ${googleStatus}).`;
                if (placesResponse.status === 401 || placesResponse.status === 403) {
                    publicError = "The Google Maps key lacks access to Places API (New). Check its API restrictions and billing project.";
                } else if (placesResponse.status === 429) {
                    publicError = "Hospital search has reached its usage limit. Please try again later.";
                }
                return json({ error: publicError }, placesResponse.status >= 500 ? 502 : placesResponse.status);
            }

            const suggestions = (data.suggestions || [])
                .map(item => item.placePrediction)
                .filter(prediction => prediction?.placeId && prediction?.text?.text)
                .slice(0, 5)
                .map(prediction => ({
                    placeId: prediction.placeId,
                    description: prediction.text.text
                }));

            return json({ suggestions });
        } catch (error) {
            console.error("Could not reach Google Places.", error);
            return json({ error: "Hospital search is temporarily unavailable." }, 502);
        }
    }
};

