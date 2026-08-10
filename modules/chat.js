export async function sendMessageToLLM(userText) {
    const apiKey = "AIzaSyDqzulWSnaq1b1kDtuL-jelkoezVEvUzfk";

    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [{ text: userText }]
                    }
                ]
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || `API error ${response.status}`);
    }

    return data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "(No response)";
}
