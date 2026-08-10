import { sendMessageToLLM } from "./modules/chat.js";
import { saveDocument, loadDocuments } from "./modules/documents.js";
import { addReminder, listReminders } from "./modules/reminders.js";

document.getElementById("sendBtn").onclick = async () => {
    const input = document.getElementById("chatInput").value;
    if (!input) return;

    appendChat("user", input);
    const reply = await sendMessageToLLM(input);
    appendChat("ai", reply);

    document.getElementById("chatInput").value = "";
};

document.getElementById("newReminderBtn").onclick = () => {
    const text = prompt("Enter reminder text:");
    if (text) addReminder(text);
};

document.getElementById("listReminderBtn").onclick = () => {
    const list = listReminders();
    alert("Reminders:\n\n" + list.join("\n"));
};

function appendChat(sender, text) {
    const chatWindow = document.getElementById("chatWindow");
    const div = document.createElement("div");
    div.textContent = `${sender.toUpperCase()}: ${text}`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}
