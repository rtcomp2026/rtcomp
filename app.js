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
const diseaseForm = document.getElementById("diseaseForm");
const diseaseSaveStatus = document.getElementById("diseaseSaveStatus");
const treatmentPage = document.getElementById("treatmentPage");
const treatmentForm = document.getElementById("treatmentForm");
const treatmentSaveStatus = document.getElementById("treatmentSaveStatus");
const treatmentDirectionsLink = document.getElementById("treatmentDirectionsLink");
const treatmentJourneyPage = document.getElementById("treatmentJourneyPage");
const informationDatabasePage = document.getElementById("informationDatabasePage");

const PROFILE_STORAGE_KEY = "rtCompanionProfile";
const TREATMENT_STORAGE_KEY = "rtCompanionTreatment";
const EMPTY_TREATMENT = {
    treatmentType: "",
    treatmentStartDate: "",
    treatmentStartTime: "",
    treatmentLocation: ""
};
const EMPTY_PROFILE = {
    name: "",
    birthday: "",
    email: "",
    phone: "",
    address: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    notes: "",
    diseaseType: "",
    diagnosisDate: "",
    diseaseInfo: "",
    riskGroup: "I don't know",
    gradeGroup: "I don't know",
    psaAtDiagnosis: "",
    clinicalStage: "",
    prostateRemoved: "I don't know",
    treatmentInfo: ""
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

function loadTreatment() {
    try {
        const storedTreatment = JSON.parse(
            localStorage.getItem(TREATMENT_STORAGE_KEY) || "{}"
        );
        return { ...EMPTY_TREATMENT, ...storedTreatment };
    } catch (error) {
        console.error("Could not read the stored treatment JSON.", error);
        return { ...EMPTY_TREATMENT };
    }
}

function saveTreatment(treatment) {
    const safeTreatment = Object.fromEntries(
        Object.keys(EMPTY_TREATMENT).map(key => [
            key,
            String(treatment[key] || "").trim()
        ])
    );
    localStorage.setItem(TREATMENT_STORAGE_KEY, JSON.stringify(safeTreatment));
    return safeTreatment;
}

function fillTreatmentForm(treatment) {
    Object.entries(treatment).forEach(([fieldName, value]) => {
        const field = treatmentForm.elements.namedItem(fieldName);
        if (field) field.value = value;
    });
}

function updateTreatmentDirections(treatment) {
    const location = treatment.treatmentLocation.trim();
    treatmentDirectionsLink.hidden = !location;
    if (!location) return;

    document.getElementById("savedTreatmentLocation").textContent = location;
    treatmentDirectionsLink.href =
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`;
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
        const fields = document.querySelectorAll(`[name="${fieldName}"]`);
        fields.forEach(field => {
            if (field.type === "radio") {
                field.checked = field.value === value;
            } else {
                field.value = value;
            }
        });
    });
}

function collectProfileData() {
    return {
        ...Object.fromEntries(new FormData(profileForm)),
        ...Object.fromEntries(new FormData(diseaseForm))
    };
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
    diseaseSaveStatus.textContent = "";
    setMenuOpen(false);
    infoPage.hidden = false;
    document.getElementById("closeInfoBtn").focus();
}

function closeTreatmentPage() {
    treatmentPage.hidden = true;
    document.getElementById("treatmentInfoBtn").focus();
}

function openTreatmentPage() {
    const treatment = loadTreatment();
    fillTreatmentForm(treatment);
    updateTreatmentDirections(treatment);
    treatmentSaveStatus.textContent = "";
    setMenuOpen(false);
    treatmentPage.hidden = false;
    document.getElementById("closeTreatmentBtn").focus();
}

function closePlaceholderPage(page, menuButtonId) {
    page.hidden = true;
    document.getElementById(menuButtonId).focus();
}

function openPlaceholderPage(page, closeButtonId) {
    setMenuOpen(false);
    page.hidden = false;
    document.getElementById(closeButtonId).focus();
}

manualBtn.onclick = () => setMenuOpen(true);
document.getElementById("closeMenuBtn").onclick = () => setMenuOpen(false);
menuOverlay.onclick = () => setMenuOpen(false);
document.getElementById("closeRemindersBtn").onclick = closeRemindersPage;
document.getElementById("closeInfoBtn").onclick = closeInfoPage;
document.getElementById("closeTreatmentBtn").onclick = closeTreatmentPage;
document.getElementById("closeTreatmentJourneyBtn").onclick = () =>
    closePlaceholderPage(treatmentJourneyPage, "treatmentJourneyBtn");
document.getElementById("closeInformationDatabaseBtn").onclick = () =>
    closePlaceholderPage(informationDatabasePage, "informationDatabaseBtn");

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    if (!informationDatabasePage.hidden) {
        closePlaceholderPage(informationDatabasePage, "informationDatabaseBtn");
    } else if (!treatmentJourneyPage.hidden) {
        closePlaceholderPage(treatmentJourneyPage, "treatmentJourneyBtn");
    } else if (!treatmentPage.hidden) {
        closeTreatmentPage();
    } else if (!infoPage.hidden) {
        closeInfoPage();
    } else if (!remindersPage.hidden) {
        closeRemindersPage();
    } else {
        setMenuOpen(false);
    }
});

const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

async function submitChatMessage() {
    const input = chatInput.value.trim();
    if (!input || sendBtn.disabled) return;

    appendChat("user", input);
    chatInput.value = "";
    sendBtn.disabled = true;
    sendBtn.textContent = "Thinking…";

    try {
        const reply = await sendMessageToLLM(input);
        appendChat("ai", reply);
    } catch (error) {
        console.error("Chat request failed.", error);
        appendChat("error", error.message || "The AI service is unavailable.");
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        chatInput.focus();
    }
}

sendBtn.onclick = submitChatMessage;
chatInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        submitChatMessage();
    }
});

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

document.getElementById("treatmentInfoBtn").onclick = openTreatmentPage;
document.getElementById("treatmentJourneyBtn").onclick = () =>
    openPlaceholderPage(treatmentJourneyPage, "closeTreatmentJourneyBtn");
document.getElementById("informationDatabaseBtn").onclick = () =>
    openPlaceholderPage(informationDatabasePage, "closeInformationDatabaseBtn");

profileForm.addEventListener("submit", event => {
    event.preventDefault();
    const savedProfile = saveProfile(collectProfileData());
    fillProfileForm(savedProfile);
    updateGreeting(savedProfile);
    profileSaveStatus.textContent = "Information saved in this browser.";
});

diseaseForm.addEventListener("submit", event => {
    event.preventDefault();
    const savedProfile = saveProfile(collectProfileData());
    fillProfileForm(savedProfile);
    diseaseSaveStatus.textContent = "Disease information saved in this browser.";
});

treatmentForm.addEventListener("submit", event => {
    event.preventDefault();
    const savedTreatment = saveTreatment(
        Object.fromEntries(new FormData(treatmentForm))
    );
    fillTreatmentForm(savedTreatment);
    updateTreatmentDirections(savedTreatment);
    treatmentSaveStatus.textContent = "Treatment information saved in this browser.";
});

updateGreeting(loadProfile());

function appendChat(sender, text) {
    const chatWindow = document.getElementById("chatWindow");
    const div = document.createElement("div");
    div.textContent = `${sender.toUpperCase()}: ${text}`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}
