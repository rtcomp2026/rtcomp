import { sendMessageToLLM } from "./modules/chat.js";
import { saveDocument, loadDocuments } from "./modules/documents.js";
import { addReminder, listReminders } from "./modules/reminders.js";

const sidebar = document.getElementById("sidebar");
const menuOverlay = document.getElementById("menuOverlay");
const manualBtn = document.getElementById("manualBtn");
const remindersPage = document.getElementById("remindersPage");
const remindersContent = document.getElementById("remindersContent");

document.getElementById("currentDate").textContent = new Intl.DateTimeFormat(
    navigator.language,
    {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    }
).format(new Date());

function setMenuOpen(isOpen) {
    sidebar.classList.toggle("open", isOpen);
    sidebar.setAttribute("aria-hidden", String(!isOpen));
    manualBtn.setAttribute("aria-expanded", String(isOpen));
    menuOverlay.hidden = !isOpen;
}

function closeRemindersPage() {
    remindersPage.hidden = true;
    document.getElementById("listReminderBtn").focus();
}

function openRemindersPage() {
    const reminders = listReminders();
    remindersContent.replaceChildren();

    if (reminders.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "emptyReminders";
        emptyMessage.textContent = "No reminders yet.";
        remindersContent.appendChild(emptyMessage);
    } else {
        const reminderList = document.createElement("ul");
        reminderList.className = "reminderList";

        reminders.forEach((reminder, index) => {
            const item = document.createElement("li");
            item.className = "reminderItem";
            item.textContent = `${index + 1}. ${reminder}`;
            reminderList.appendChild(item);
        });

        remindersContent.appendChild(reminderList);
    }

    setMenuOpen(false);
    remindersPage.hidden = false;
    document.getElementById("closeRemindersBtn").focus();
}

manualBtn.onclick = () => setMenuOpen(true);
document.getElementById("closeMenuBtn").onclick = () => setMenuOpen(false);
menuOverlay.onclick = () => setMenuOpen(false);
document.getElementById("closeRemindersBtn").onclick = closeRemindersPage;

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    if (!remindersPage.hidden) {
        closeRemindersPage();
    } else {
        setMenuOpen(false);
    }
});

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
    setMenuOpen(false);
};

document.getElementById("listReminderBtn").onclick = () => {
    openRemindersPage();
};

document.getElementById("personBtn").onclick = () => {
    alert("AI Agent with chat and reminder tools.");
    setMenuOpen(false);
};

function appendChat(sender, text) {
    const chatWindow = document.getElementById("chatWindow");
    const div = document.createElement("div");
    div.textContent = `${sender.toUpperCase()}: ${text}`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}
