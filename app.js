import { sendMessageToLLM } from "./modules/chat.js";
import { saveDocument, loadDocuments } from "./modules/documents.js";
import { addReminder, listReminders } from "./modules/reminders.js";

const sidebar = document.getElementById("sidebar");
const menuOverlay = document.getElementById("menuOverlay");
const manualBtn = document.getElementById("manualBtn");
const remindersPage = document.getElementById("remindersPage");
const remindersContent = document.getElementById("remindersContent");
const infoPage = document.getElementById("infoPage");
const profileForm = document.getElementById("profileForm");
const profileSaveStatus = document.getElementById("profileSaveStatus");

const PROFILE_STORAGE_KEY = "rtCompanionProfile";
const EMPTY_PROFILE = {
    name: "",
    birthday: "",
    email: "",
    phone: "",
    address: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    notes: ""
};

function loadProfile() {
    try {
        const storedProfile = JSON.parse(
            localStorage.getItem(PROFILE_STORAGE_KEY) || "{}"
        );
        return { ...EMPTY_PROFILE, ...storedProfile };
    } catch (error) {
        console.error("Could not read the stored profile JSON.", error);
        return { ...EMPTY_PROFILE };
    }
}

function saveProfile(profile) {
    const safeProfile = Object.fromEntries(
        Object.keys(EMPTY_PROFILE).map(key => [
            key,
            String(profile[key] || "").trim()
        ])
    );

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(safeProfile));
    return safeProfile;
}

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

function fillProfileForm(profile) {
    Object.entries(profile).forEach(([fieldName, value]) => {
        const field = profileForm.elements.namedItem(fieldName);
        if (field) field.value = value;
    });
}

function updateGreeting(profile) {
    if (profile.name) {
        document.getElementById("greetingMessage").textContent =
            `Hello, ${profile.name}! Your personalized daily message will appear here.`;
    }
}

function closeInfoPage() {
    infoPage.hidden = true;
    document.getElementById("personBtn").focus();
}

function openInfoPage() {
    fillProfileForm(loadProfile());
    profileSaveStatus.textContent = "";
    setMenuOpen(false);
    infoPage.hidden = false;
    document.getElementById("closeInfoBtn").focus();
}

manualBtn.onclick = () => setMenuOpen(true);
document.getElementById("closeMenuBtn").onclick = () => setMenuOpen(false);
menuOverlay.onclick = () => setMenuOpen(false);
document.getElementById("closeRemindersBtn").onclick = closeRemindersPage;
document.getElementById("closeInfoBtn").onclick = closeInfoPage;

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    if (!infoPage.hidden) {
        closeInfoPage();
    } else if (!remindersPage.hidden) {
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
    openInfoPage();
};

profileForm.addEventListener("submit", event => {
    event.preventDefault();
    const savedProfile = saveProfile(Object.fromEntries(new FormData(profileForm)));
    fillProfileForm(savedProfile);
    updateGreeting(savedProfile);
    profileSaveStatus.textContent = "Information saved in this browser.";
});

updateGreeting(loadProfile());

function appendChat(sender, text) {
    const chatWindow = document.getElementById("chatWindow");
    const div = document.createElement("div");
    div.textContent = `${sender.toUpperCase()}: ${text}`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}
