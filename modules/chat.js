export async function sendMessageToLLM(userText) {
    const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Chat request failed (${response.status}).`);
    }

    if (!data.reply) {
        throw new Error("Gemini returned an empty response.");
    }

    return data.reply;
}
