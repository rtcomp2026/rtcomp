import { sendMessageToLLM } from "./modules/chat.js";
import { saveDocument, loadDocuments } from "./modules/documents.js";
import {
    addReminder,
    listReminders,
    syncTreatmentAppointmentReminders
} from "./modules/reminders.js?v=20260824-1";

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
const treatmentPhoneLink = document.getElementById("treatmentPhoneLink");
const callConfirmationDialog = document.getElementById("callConfirmationDialog");
const confirmHospitalCallLink = document.getElementById("confirmHospitalCallLink");
const treatmentLocationInput = document.getElementById("treatmentLocation");
const treatmentPlaceIdInput = document.getElementById("treatmentPlaceId");
const treatmentOfficeNumberInput = document.getElementById("treatmentOfficeNumber");
const hospitalSuggestions = document.getElementById("hospitalSuggestions");
const treatmentJourneyPage = document.getElementById("treatmentJourneyPage");
const informationDatabasePage = document.getElementById("informationDatabasePage");
const treatmentPlanForm = document.getElementById("treatmentPlanForm");
const treatmentPlanSaveStatus = document.getElementById("treatmentPlanSaveStatus");
const expertTreatmentSelect = document.getElementById("expertTreatmentSelect");
const newExpertTreatmentBtn = document.getElementById("newExpertTreatmentBtn");
const updateExpertTreatmentBtn = document.getElementById("updateExpertTreatmentBtn");
const treatmentScheduleList = document.getElementById("treatmentScheduleList");
const addTreatmentAppointmentBtn = document.getElementById("addTreatmentAppointmentBtn");
const treatmentTypeSelect = document.getElementById("treatmentType");
const dataFileSaveStatus = document.getElementById("dataFileSaveStatus");
const expertDbFileInput = document.getElementById("expertDbFileInput");
const userDataFileInput = document.getElementById("userDataFileInput");

const PROFILE_STORAGE_KEY = "rtCompanionProfile";
const TREATMENT_STORAGE_KEY = "rtCompanionTreatment";
const TREATMENT_DATABASE_STORAGE_KEY = "rtCompanionTreatmentDatabase";
const LEGACY_TREATMENT_PLAN_STORAGE_KEY = "rtCompanionTreatmentPlan";
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const EMPTY_TREATMENT = {
    treatmentType: "",
    treatmentStartDate: "",
    treatmentStartTime: "",
    treatmentSchedule: "[]",
    treatmentLocation: "",
    treatmentPlaceId: "",
    treatmentOfficeNumber: ""
};
const EMPTY_EXPERT_TREATMENT = {
    treatmentName: "",
    overview: "",
    totalFractions: "",
    dosePerFraction: "",
    doseUnit: "Gy",
    preparationBeforeFraction: "",
    symptomsAfterFraction: ""
};

let currentExpertTreatmentName = "";

let hospitalSearchTimer;
let hospitalSearchController;
let hospitalSessionToken = createHospitalSessionToken();
let currentHospitalSuggestions = [];
let activeHospitalSuggestion = -1;
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
        const treatment = { ...EMPTY_TREATMENT, ...storedTreatment };

        // Move a schedule created by the short-lived expert-calendar version
        // into the matching user's treatment record.
        if (!parseFractionSchedule(treatment.treatmentSchedule).length) {
            const storedDatabase = JSON.parse(
                localStorage.getItem(TREATMENT_DATABASE_STORAGE_KEY) || "[]"
            );
            const matchingExpert = Array.isArray(storedDatabase)
                ? storedDatabase.find(item =>
                    normalizeTreatmentName(item?.treatmentName) ===
                    normalizeTreatmentName(treatment.treatmentType)
                )
                : null;
            const previousSchedule = parseFractionSchedule(
                matchingExpert?.fractionSchedule
            );
            if (previousSchedule.length) {
                treatment.treatmentSchedule = JSON.stringify(previousSchedule);
                treatment.treatmentStartDate = previousSchedule[0].date;
                treatment.treatmentStartTime = previousSchedule[0].time;
            }
        }
        return treatment;
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

function normalizeTreatmentName(value) {
    return String(value || "").trim().toLocaleLowerCase();
}

function parseFractionSchedule(value) {
    let appointments = value;
    if (typeof value === "string") {
        try {
            appointments = JSON.parse(value || "[]");
        } catch {
            return [];
        }
    }
    if (!Array.isArray(appointments)) return [];

    return appointments.slice(0, 100).map(appointment => ({
        date: String(appointment?.date || "").trim(),
        time: String(appointment?.time || "").trim()
    })).filter(appointment =>
        /^\d{4}-\d{2}-\d{2}$/.test(appointment.date) &&
        parseLocalDate(appointment.date) &&
        /^\d{2}:\d{2}$/.test(appointment.time)
    ).sort((left, right) =>
        `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`)
    );
}

function sanitizeExpertTreatment(treatment) {
    return Object.fromEntries(
        Object.keys(EMPTY_EXPERT_TREATMENT).map(key => [
            key,
            String(treatment?.[key] || EMPTY_EXPERT_TREATMENT[key]).trim()
        ])
    );
}

function migrateLegacyTreatmentPlan() {
    try {
        const legacy = JSON.parse(
            localStorage.getItem(LEGACY_TREATMENT_PLAN_STORAGE_KEY) || "null"
        );
        if (!legacy || !legacy.treatmentType || !legacy.totalFractions) return [];
        return [sanitizeExpertTreatment({
            treatmentName: legacy.treatmentType,
            overview: "Imported from the previous Information Database format.",
            totalFractions: legacy.totalFractions,
            dosePerFraction: legacy.radiationDosePerFraction || "0",
            doseUnit: "Gy",
            preparationBeforeFraction: legacy.visitPreparation,
            symptomsAfterFraction: legacy.expectedSymptoms
        })];
    } catch (error) {
        console.error("Could not migrate the previous treatment plan.", error);
        return [];
    }
}

function loadTreatmentDatabase() {
    try {
        const stored = localStorage.getItem(TREATMENT_DATABASE_STORAGE_KEY);
        if (!stored) {
            const migrated = migrateLegacyTreatmentPlan();
            if (migrated.length) saveTreatmentDatabase(migrated);
            return migrated;
        }
        const treatments = JSON.parse(stored);
        return Array.isArray(treatments)
            ? treatments.map(sanitizeExpertTreatment).filter(item => item.treatmentName)
            : [];
    } catch (error) {
        console.error("Could not read the treatment information database.", error);
        return [];
    }
}

function saveTreatmentDatabase(treatments) {
    const safeTreatments = treatments
        .slice(0, 200)
        .map(sanitizeExpertTreatment)
        .filter(item => item.treatmentName);
    localStorage.setItem(TREATMENT_DATABASE_STORAGE_KEY, JSON.stringify(safeTreatments));
    return safeTreatments;
}

function loadMatchingTreatmentPlan(treatment = loadTreatment()) {
    const treatmentName = normalizeTreatmentName(treatment.treatmentType);
    if (!treatmentName) return null;
    return loadTreatmentDatabase().find(
        item => normalizeTreatmentName(item.treatmentName) === treatmentName
    ) || null;
}

function readLocalJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
        console.error(`Could not read local JSON for ${key}.`, error);
        return fallback;
    }
}

function buildExpertDatabaseFile() {
    return {
        fileType: "RTCompanion Information Database",
        schemaVersion: 4,
        savedAt: new Date().toISOString(),
        treatments: loadTreatmentDatabase()
    };
}

function buildUserDataFile() {
    return {
        fileType: "RTCompanion User Data",
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        personalAndDiseaseInformation: loadProfile(),
        treatmentInformation: loadTreatment(),
        reminders: readLocalJson("reminders", []),
        documents: loadDocuments()
    };
}

async function saveJsonFile(filename, data) {
    const jsonText = `${JSON.stringify(data, null, 2)}\n`;

    if ("showSaveFilePicker" in window && window.isSecureContext) {
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
                description: "JSON data file",
                accept: { "application/json": [".json"] }
            }]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(jsonText);
        await writable.close();
        return;
    }

    const fileBlob = new Blob([jsonText], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(fileBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
}

async function saveDataFile(filename, dataBuilder) {
    dataFileSaveStatus.textContent = "";
    try {
        await saveJsonFile(filename, dataBuilder());
        dataFileSaveStatus.textContent = `${filename} was saved on this computer.`;
    } catch (error) {
        if (error.name === "AbortError") {
            dataFileSaveStatus.textContent = "File save canceled.";
            return;
        }
        console.error(`Could not save ${filename}.`, error);
        dataFileSaveStatus.textContent = `Could not save ${filename}.`;
    }
}

async function saveExpertDatabaseFile() {
    if (!loadTreatmentDatabase().length) {
        dataFileSaveStatus.textContent =
            "Create at least one treatment before saving expertdb.json.";
        return;
    }
    await saveDataFile("expertdb.json", buildExpertDatabaseFile);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" &&
        !Array.isArray(value);
}

function sanitizeImportedRecord(source, template, maximumLength = 10000) {
    if (!isPlainObject(source)) {
        throw new Error("The data file has an invalid structure.");
    }
    return Object.fromEntries(
        Object.keys(template).map(key => [
            key,
            String(source[key] || "").trim().slice(0, maximumLength)
        ])
    );
}

function validateImportedExpertTreatment(source) {
    const plan = sanitizeImportedRecord(
        sanitizeExpertTreatment(source),
        EMPTY_EXPERT_TREATMENT
    );
    const totalFractions = Number.parseInt(plan.totalFractions, 10);
    const dose = Number.parseFloat(plan.dosePerFraction);

    if (!plan.treatmentName) {
        throw new Error("The expert database contains a treatment without a name.");
    }
    if (!Number.isInteger(totalFractions) || totalFractions < 1 || totalFractions > 100) {
        throw new Error("The expert database has an invalid number of fractions.");
    }
    if (!Number.isFinite(dose) || dose < 0) {
        throw new Error("The expert database has an invalid dose per fraction.");
    }
    return plan;
}

function sanitizeImportedReminders(reminders) {
    if (!Array.isArray(reminders)) {
        throw new Error("The user data file has an invalid reminders list.");
    }
    return reminders.slice(0, 1000).map(reminder => {
        if (!isPlainObject(reminder) || typeof reminder.text !== "string") {
            throw new Error("The user data file contains an invalid reminder.");
        }
        const safeReminder = {
            text: reminder.text.trim().slice(0, 5000),
            created: Number.isFinite(Number(reminder.created))
                ? Number(reminder.created)
                : Date.now()
        };
        if (reminder.source === "treatmentAppointment") {
            safeReminder.source = "treatmentAppointment";
            safeReminder.appointmentKey = String(
                reminder.appointmentKey || ""
            ).trim().slice(0, 100);
        }
        return safeReminder;
    }).filter(reminder => reminder.text);
}

function sanitizeImportedDocuments(documents) {
    if (!isPlainObject(documents)) {
        throw new Error("The user data file has an invalid documents collection.");
    }
    return Object.fromEntries(
        Object.entries(documents).slice(0, 100).map(([name, content]) => [
            String(name).slice(0, 200),
            String(content).slice(0, 200000)
        ])
    );
}

async function readDataFile(file, expectedFileType, allowedSchemaVersions = [1]) {
    if (!file) throw new Error("No file was selected.");
    if (file.size > MAX_IMPORT_FILE_BYTES) {
        throw new Error("The selected file is too large. The maximum size is 2 MB.");
    }

    let data;
    try {
        data = JSON.parse(await file.text());
    } catch {
        throw new Error("The selected file is not valid JSON.");
    }

    if (
        !isPlainObject(data) ||
        data.fileType !== expectedFileType ||
        !allowedSchemaVersions.includes(data.schemaVersion)
    ) {
        throw new Error("This is not a compatible RTCompanion data file.");
    }
    return data;
}

async function loadExpertDatabaseFile(file) {
    const data = await readDataFile(
        file,
        "RTCompanion Information Database",
        [1, 2, 3, 4]
    );
    let treatments;
    if ([2, 3, 4].includes(data.schemaVersion) && Array.isArray(data.treatments)) {
        treatments = data.treatments.map(item =>
            validateImportedExpertTreatment(item)
        );
    } else if (data.schemaVersion === 1 && isPlainObject(data.treatmentPlan)) {
        const legacy = data.treatmentPlan;
        treatments = [validateImportedExpertTreatment({
            treatmentName: legacy.treatmentType,
            overview: "Imported from the previous Information Database format.",
            totalFractions: legacy.totalFractions,
            dosePerFraction: legacy.radiationDosePerFraction || "0",
            doseUnit: "Gy",
            preparationBeforeFraction: legacy.visitPreparation,
            symptomsAfterFraction: legacy.expectedSymptoms
        })];
    } else {
        throw new Error("The expert database does not contain a treatments list.");
    }
    if (!treatments.length || treatments.length > 200) {
        throw new Error("The expert database must contain between 1 and 200 treatments.");
    }
    const names = treatments.map(item => normalizeTreatmentName(item.treatmentName));
    if (new Set(names).size !== names.length) {
        throw new Error("The expert database contains duplicate treatment names.");
    }
    const savedTreatments = saveTreatmentDatabase(treatments);
    refreshTreatmentSelectors();
    showExpertTreatment(savedTreatments[0]);
    renderConnectedTreatmentViews();
    treatmentPlanSaveStatus.textContent = "Treatment library restored from expertdb.json.";
}

async function loadUserDataFile(file) {
    const data = await readDataFile(file, "RTCompanion User Data");
    const profile = sanitizeImportedRecord(
        data.personalAndDiseaseInformation,
        EMPTY_PROFILE
    );
    const treatment = sanitizeImportedRecord(
        data.treatmentInformation,
        EMPTY_TREATMENT
    );
    const reminders = sanitizeImportedReminders(data.reminders);
    const documents = sanitizeImportedDocuments(data.documents);

    const savedProfile = saveProfile(profile);
    const savedTreatment = saveTreatment(treatment);
    localStorage.setItem("reminders", JSON.stringify(reminders));
    localStorage.setItem("docs", JSON.stringify(documents));

    fillProfileForm(savedProfile);
    refreshTreatmentSelectors(savedTreatment.treatmentType);
    fillTreatmentForm(savedTreatment);
    updateGreeting(savedProfile);
    updateTreatmentDirections(savedTreatment);
    renderReminders();
    renderConnectedTreatmentViews();
}

async function handleDataFileSelection(input, loader, successMessage) {
    dataFileSaveStatus.textContent = "";
    try {
        await loader(input.files?.[0]);
        dataFileSaveStatus.textContent = successMessage;
    } catch (error) {
        console.error("Could not load the selected data file.", error);
        dataFileSaveStatus.textContent = error.message || "Could not load the selected data file.";
    } finally {
        input.value = "";
    }
}

function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
    if (
        date.getFullYear() !== parts[0] ||
        date.getMonth() !== parts[1] - 1 ||
        date.getDate() !== parts[2]
    ) return null;
    return date;
}

function addDays(date, numberOfDays) {
    const result = new Date(date);
    result.setDate(result.getDate() + numberOfDays);
    return result;
}

function formatVisitDate(date) {
    return new Intl.DateTimeFormat(navigator.language, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
    }).format(date);
}

function formatTreatmentTime(time) {
    if (!time) return "";
    const [hours, minutes] = time.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
    return new Intl.DateTimeFormat(navigator.language, {
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(2000, 0, 1, hours, minutes));
}

function buildTreatmentSchedule(plan, treatment = loadTreatment()) {
    const savedSchedule = parseFractionSchedule(treatment.treatmentSchedule);
    const schedule = savedSchedule.length
        ? savedSchedule
        : treatment.treatmentStartDate && treatment.treatmentStartTime
            ? [{
                date: treatment.treatmentStartDate,
                time: treatment.treatmentStartTime
            }]
            : [];
    return schedule.map((appointment, index) => {
        const date = parseLocalDate(appointment.date);
        return {
            fraction: index + 1,
            date,
            dateKey: appointment.date,
            time: appointment.time
        };
    });
}

function fillTreatmentPlanForm(plan = EMPTY_EXPERT_TREATMENT) {
    Object.entries({ ...EMPTY_EXPERT_TREATMENT, ...plan }).forEach(([fieldName, value]) => {
        const field = treatmentPlanForm.elements.namedItem(fieldName);
        if (field) field.value = value;
    });
}

function collectTreatmentPlanFormData() {
    return sanitizeExpertTreatment(
        Object.fromEntries(new FormData(treatmentPlanForm))
    );
}

function createFractionAppointmentRow(appointment, index) {
    const row = document.createElement("div");
    row.className = "fractionAppointmentRow";

    const number = document.createElement("span");
    number.className = "fractionAppointmentNumber";
    number.textContent = `Fraction ${index + 1}`;

    const dateLabel = document.createElement("label");
    const dateText = document.createElement("span");
    dateText.textContent = "Treatment date";
    const dateInput = document.createElement("input");
    dateInput.className = "fractionDateInput";
    dateInput.type = "date";
    dateInput.required = true;
    dateInput.value = appointment.date || "";
    dateLabel.append(dateText, dateInput);

    const timeLabel = document.createElement("label");
    const timeText = document.createElement("span");
    timeText.textContent = "Treatment time";
    const timeInput = document.createElement("input");
    timeInput.className = "fractionTimeInput";
    timeInput.type = "time";
    timeInput.step = 300;
    timeInput.required = true;
    timeInput.value = appointment.time || "";
    timeLabel.append(timeText, timeInput);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "removeFractionButton";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove fraction ${index + 1}`);

    row.append(number, dateLabel, timeLabel, removeButton);
    return row;
}

function renderTreatmentSchedule(schedule, fallbackDate = "", fallbackTime = "") {
    const appointments = schedule.length
        ? [...schedule]
        : Array.from({ length: 6 }, (_, index) => {
            const firstDate = parseLocalDate(fallbackDate) || new Date();
            return {
                date: localDateKey(addDays(firstDate, index)),
                time: fallbackTime || "09:00"
            };
        });
    treatmentScheduleList.replaceChildren(...appointments.map(
        (appointment, index) => createFractionAppointmentRow(appointment, index)
    ));
}

function collectTreatmentSchedule() {
    return Array.from(
        treatmentScheduleList.querySelectorAll(".fractionAppointmentRow"),
        row => ({
            date: row.querySelector(".fractionDateInput").value,
            time: row.querySelector(".fractionTimeInput").value
        })
    ).sort((left, right) =>
        `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`)
    );
}

function renumberTreatmentRows() {
    treatmentScheduleList.querySelectorAll(".fractionAppointmentRow").forEach(
        (row, index) => {
            row.querySelector(".fractionAppointmentNumber").textContent =
                `Fraction ${index + 1}`;
            row.querySelector(".removeFractionButton").setAttribute(
                "aria-label",
                `Remove fraction ${index + 1}`
            );
        }
    );
}

function treatmentCalendarIsValid() {
    if (!treatmentForm.reportValidity()) return false;
    const schedule = collectTreatmentSchedule();
    const appointmentKeys = schedule.map(item => `${item.date}T${item.time}`);
    if (new Set(appointmentKeys).size !== appointmentKeys.length) {
        treatmentSaveStatus.textContent =
            "Each treatment appointment must have a different date and time.";
        return false;
    }
    return true;
}

function refreshTreatmentSelectors(preferredName = "") {
    const treatments = loadTreatmentDatabase();
    const names = treatments.map(item => item.treatmentName);
    const patientTreatment = loadTreatment().treatmentType;
    const selectedPatientName = preferredName || patientTreatment;

    treatmentTypeSelect.replaceChildren(new Option(
        treatments.length
            ? "Choose a treatment from Information Database"
            : "Create a treatment in Information Database first",
        ""
    ));
    names.forEach(name => treatmentTypeSelect.add(new Option(name, name)));
    if (selectedPatientName && !names.some(name =>
        normalizeTreatmentName(name) === normalizeTreatmentName(selectedPatientName)
    )) {
        treatmentTypeSelect.add(new Option(
            `${selectedPatientName} (not in database)`,
            selectedPatientName
        ));
    }
    treatmentTypeSelect.value = names.find(name =>
        normalizeTreatmentName(name) === normalizeTreatmentName(selectedPatientName)
    ) || selectedPatientName;

    expertTreatmentSelect.replaceChildren(new Option(
        treatments.length ? "Choose a treatment" : "No treatments saved yet",
        ""
    ));
    names.forEach(name => expertTreatmentSelect.add(new Option(name, name)));
    if (currentExpertTreatmentName) {
        expertTreatmentSelect.value = currentExpertTreatmentName;
    }
}

function showExpertTreatment(treatment) {
    const safeTreatment = treatment
        ? sanitizeExpertTreatment(treatment)
        : { ...EMPTY_EXPERT_TREATMENT };
    currentExpertTreatmentName = safeTreatment.treatmentName;
    fillTreatmentPlanForm(safeTreatment);
    newExpertTreatmentBtn.textContent = "Create New Treatment";
    updateExpertTreatmentBtn.disabled = !currentExpertTreatmentName;
    refreshTreatmentSelectors();
    expertTreatmentSelect.value = currentExpertTreatmentName;
}

function createTextBlock(text) {
    const paragraph = document.createElement("p");
    paragraph.className = "dashboardPrimaryText";
    paragraph.textContent = text;
    return paragraph;
}

function renderHomeTreatmentPlan() {
    const treatment = loadTreatment();
    const plan = loadMatchingTreatmentPlan(treatment) || { ...EMPTY_EXPERT_TREATMENT };
    const schedule = buildTreatmentSchedule(plan);
    const todayKey = localDateKey();
    const upcomingVisits = schedule
        .filter(visit => visit.dateKey >= todayKey)
        .slice(0, 6);
    const tasksElement = document.getElementById("todayTasks");
    const appointmentsElement = document.getElementById("todayAppointments");
    const symptomsElement = document.getElementById("todaySymptoms");

    tasksElement.replaceChildren();
    if (plan.treatmentName) {
        const treatmentTypes = createTextBlock(`Treatment: ${plan.treatmentName}`);
        treatmentTypes.classList.add("dashboardTreatmentTypes");
        tasksElement.appendChild(treatmentTypes);
    }
    tasksElement.appendChild(createTextBlock(
        plan.preparationBeforeFraction || "Preparation instructions for the next fraction will appear here."
    ));

    appointmentsElement.replaceChildren();
    if (upcomingVisits.length) {
        const list = document.createElement("ul");
        list.className = "dashboardAppointmentList";
        upcomingVisits.forEach(visit => {
            const item = document.createElement("li");
            const heading = document.createElement("strong");
            heading.textContent = plan.totalFractions
                ? `Fraction ${visit.fraction} of ${plan.totalFractions}`
                : `Treatment appointment ${visit.fraction}`;
            const details = document.createElement("span");
            const time = formatTreatmentTime(
                visit.time || treatment.treatmentStartTime
            );
            const location = treatment.treatmentLocation;
            details.textContent = [
                formatVisitDate(visit.date),
                plan.dosePerFraction
                    ? `${plan.dosePerFraction} ${plan.doseUnit} dose`
                    : "",
                time,
                location
            ].filter(Boolean).join(" • ");
            item.append(heading, details);
            list.appendChild(item);
        });
        appointmentsElement.appendChild(list);
    } else if (schedule.length) {
        appointmentsElement.appendChild(createTextBlock(
            `Treatment schedule complete — ${plan.totalFractions} fractions/visits.`
        ));
    } else {
        appointmentsElement.appendChild(createTextBlock(
            "Save Treatment Information to show the appointment dates and times here."
        ));
    }

    symptomsElement.replaceChildren();
    symptomsElement.appendChild(createTextBlock(
        plan.symptomsAfterFraction || "Expected symptoms after a fraction will appear here."
    ));
}

function renderTreatmentJourney() {
    const treatment = loadTreatment();
    const matchingPlan = loadMatchingTreatmentPlan(treatment);
    const plan = matchingPlan || { ...EMPTY_EXPERT_TREATMENT };
    const schedule = buildTreatmentSchedule(plan);
    const emptyState = document.getElementById("journeyEmptyState");
    const planContent = document.getElementById("journeyPlanContent");

    emptyState.hidden = schedule.length > 0;
    planContent.hidden = schedule.length === 0;
    if (!schedule.length) {
        const emptyMessage = emptyState.querySelector("p");
        if (!treatment.treatmentType) {
            emptyMessage.textContent =
                "Choose and save a Treatment Type in Treatment Information first.";
        } else if (!matchingPlan) {
            emptyMessage.textContent =
                `No Information Database entry matches ${treatment.treatmentType}. Open Information Database to create one.`;
        } else {
            emptyMessage.textContent =
                "Add at least one treatment date and time in Treatment Information.";
        }
        return;
    }

    const startDate = schedule[0]?.date;
    document.getElementById("journeyScheduleSummary").textContent = [
        `${schedule.length} scheduled fractions/visits`,
        startDate ? `starting ${formatVisitDate(startDate)}` : "",
        plan.treatmentName,
        plan.dosePerFraction ? `${plan.dosePerFraction} ${plan.doseUnit} per fraction` : "",
        treatment.treatmentLocation
    ].filter(Boolean).join(" • ");
    document.getElementById("journeySymptoms").textContent =
        plan.symptomsAfterFraction || "No expected symptoms entered.";
    document.getElementById("journeyPreparation").textContent =
        plan.preparationBeforeFraction || "No preparation instructions entered.";

    const timeline = document.getElementById("journeyTimeline");
    const todayKey = localDateKey();
    timeline.replaceChildren();
    schedule.forEach(visit => {
        const item = document.createElement("li");
        item.className = visit.dateKey < todayKey
            ? "completed"
            : visit.dateKey === todayKey
                ? "today"
                : "upcoming";

        const marker = document.createElement("span");
        marker.className = "timelineMarker";
        marker.textContent = visit.dateKey < todayKey ? "✓" : String(visit.fraction);

        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = plan.totalFractions
            ? `Fraction ${visit.fraction} of ${plan.totalFractions}`
            : `Treatment appointment ${visit.fraction}`;
        const details = document.createElement("span");
        details.textContent = [
            formatVisitDate(visit.date),
            plan.dosePerFraction ? `${plan.dosePerFraction} ${plan.doseUnit}` : "",
            formatTreatmentTime(visit.time || treatment.treatmentStartTime),
            treatment.treatmentLocation
        ].filter(Boolean).join(" • ");
        content.append(title, details);
        item.append(marker, content);
        timeline.appendChild(item);
    });
}

function renderConnectedTreatmentViews() {
    renderHomeTreatmentPlan();
    renderTreatmentJourney();
}

function fillTreatmentForm(treatment) {
    Object.entries(treatment).forEach(([fieldName, value]) => {
        if (fieldName === "treatmentSchedule") return;
        const field = treatmentForm.elements.namedItem(fieldName);
        if (field) field.value = value;
    });
    renderTreatmentSchedule(
        parseFractionSchedule(treatment.treatmentSchedule),
        treatment.treatmentStartDate,
        treatment.treatmentStartTime
    );
    validateHospitalPhone();
}

function normalizeHospitalPhone(phoneNumber) {
    const digits = String(phoneNumber || "").replace(/\D/g, "");
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return "";
}

function validateHospitalPhone() {
    const phoneNumber = treatmentOfficeNumberInput.value.trim();
    const isValid = !phoneNumber || Boolean(normalizeHospitalPhone(phoneNumber));
    treatmentOfficeNumberInput.setCustomValidity(
        isValid
            ? ""
            : "Enter a 10-digit phone number, or 11 digits beginning with 1. Any formatting is allowed."
    );
    return isValid;
}

function updateTreatmentDirections(treatment) {
    const location = treatment.treatmentLocation.trim();
    treatmentDirectionsLink.hidden = !location;
    if (location) {
        document.getElementById("savedTreatmentLocation").textContent = location;
        const placeId = treatment.treatmentPlaceId.trim();
        const placeIdParameter = placeId
            ? `&destination_place_id=${encodeURIComponent(placeId)}`
            : "";
        treatmentDirectionsLink.href =
            `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}${placeIdParameter}`;
    }

    const phoneNumber = treatment.treatmentOfficeNumber.trim();
    const callableNumber = normalizeHospitalPhone(phoneNumber);
    treatmentPhoneLink.hidden = !callableNumber;
    if (callableNumber) {
        document.getElementById("savedTreatmentPhone").textContent = phoneNumber;
        document.getElementById("callConfirmationNumber").textContent = phoneNumber;
        confirmHospitalCallLink.href = `tel:${callableNumber}`;
    }
}

function createHospitalSessionToken() {
    return crypto.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hideHospitalSuggestions() {
    hospitalSuggestions.hidden = true;
    hospitalSuggestions.replaceChildren();
    treatmentLocationInput.setAttribute("aria-expanded", "false");
    treatmentLocationInput.removeAttribute("aria-activedescendant");
    currentHospitalSuggestions = [];
    activeHospitalSuggestion = -1;
}

function selectHospitalSuggestion(suggestion) {
    treatmentLocationInput.value = suggestion.description;
    treatmentPlaceIdInput.value = suggestion.placeId;
    hideHospitalSuggestions();
    hospitalSessionToken = createHospitalSessionToken();
    treatmentSaveStatus.textContent = "Hospital selected. Save the treatment information when ready.";
}

function setActiveHospitalSuggestion(index) {
    const options = [...hospitalSuggestions.querySelectorAll("button")];
    if (!options.length) return;

    activeHospitalSuggestion = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
        option.classList.toggle("active", optionIndex === activeHospitalSuggestion);
        option.setAttribute("aria-selected", String(optionIndex === activeHospitalSuggestion));
    });
    const activeOption = options[activeHospitalSuggestion];
    treatmentLocationInput.setAttribute("aria-activedescendant", activeOption.id);
    activeOption.scrollIntoView({ block: "nearest" });
}

function renderHospitalSuggestions(suggestions) {
    hospitalSuggestions.replaceChildren();
    currentHospitalSuggestions = suggestions;
    activeHospitalSuggestion = -1;

    if (!suggestions.length) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "hospitalSuggestionMessage";
        emptyItem.textContent = "No matching hospitals found.";
        hospitalSuggestions.appendChild(emptyItem);
    } else {
        suggestions.forEach((suggestion, index) => {
            const item = document.createElement("li");
            item.setAttribute("role", "option");

            const button = document.createElement("button");
            button.id = `hospital-option-${index}`;
            button.type = "button";
            button.className = "hospitalSuggestion";
            button.setAttribute("aria-selected", "false");
            button.textContent = suggestion.description;
            button.addEventListener("mousedown", event => event.preventDefault());
            button.addEventListener("click", () => selectHospitalSuggestion(suggestion));

            item.appendChild(button);
            hospitalSuggestions.appendChild(item);
        });
    }

    hospitalSuggestions.hidden = false;
    treatmentLocationInput.setAttribute("aria-expanded", "true");
}

async function searchHospitals(query) {
    hospitalSearchController?.abort();
    hospitalSearchController = new AbortController();

    try {
        const parameters = new URLSearchParams({
            input: query,
            sessionToken: hospitalSessionToken
        });
        const response = await fetch(`/api/hospitals?${parameters}`, {
            signal: hospitalSearchController.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Hospital search is unavailable.");
        }
        if (treatmentLocationInput.value.trim() === query) {
            renderHospitalSuggestions(data.suggestions || []);
        }
    } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Hospital search failed.", error);
        treatmentSaveStatus.textContent = error.message;
        hideHospitalSuggestions();
    }
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

function renderReminders() {
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

}

function openRemindersPage() {
    renderReminders();
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
    document.getElementById("greetingMessage").textContent = profile.name
        ? `Hello, ${profile.name}! Your personalized daily message will appear here.`
        : "Hello! Your personalized daily greeting will appear here.";
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
    clearTimeout(hospitalSearchTimer);
    hospitalSearchController?.abort();
    hideHospitalSuggestions();
    treatmentPage.hidden = true;
    document.getElementById("treatmentInfoBtn").focus();
}

function openTreatmentPage() {
    const treatment = loadTreatment();
    refreshTreatmentSelectors(treatment.treatmentType);
    fillTreatmentForm(treatment);
    updateTreatmentDirections(treatment);
    treatmentSaveStatus.textContent = "";
    setMenuOpen(false);
    treatmentPage.hidden = false;
    document.getElementById("closeTreatmentBtn").focus();
}

function openTreatmentJourneyPage() {
    renderTreatmentJourney();
    openPlaceholderPage(treatmentJourneyPage, "closeTreatmentJourneyBtn");
}

function openInformationDatabasePage() {
    const treatments = loadTreatmentDatabase();
    const patientMatch = loadMatchingTreatmentPlan();
    showExpertTreatment(patientMatch || treatments[0] || EMPTY_EXPERT_TREATMENT);
    treatmentPlanSaveStatus.textContent = treatments.length
        ? "Choose a treatment to view or update its expert information."
        : "Create the first treatment type for this expert database.";
    dataFileSaveStatus.textContent = "";
    openPlaceholderPage(informationDatabasePage, "closeInformationDatabaseBtn");
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

document.getElementById("addReminderBtn").onclick = () => {
    const text = prompt("Enter reminder text:");
    if (!text?.trim()) return;

    addReminder(text.trim());
    renderReminders();
    document.getElementById("addReminderBtn").focus();
};

document.getElementById("listReminderBtn").onclick = () => {
    openRemindersPage();
};

document.getElementById("personBtn").onclick = () => {
    openInfoPage();
};

document.getElementById("treatmentInfoBtn").onclick = openTreatmentPage;
document.getElementById("treatmentJourneyBtn").onclick = openTreatmentJourneyPage;
document.getElementById("informationDatabaseBtn").onclick = openInformationDatabasePage;

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
    if (!validateHospitalPhone()) {
        treatmentOfficeNumberInput.reportValidity();
        return;
    }
    if (!treatmentCalendarIsValid()) return;
    const treatmentData = Object.fromEntries(new FormData(treatmentForm));
    const treatmentSchedule = collectTreatmentSchedule();
    treatmentData.treatmentSchedule = JSON.stringify(treatmentSchedule);
    treatmentData.treatmentStartDate = treatmentSchedule[0].date;
    treatmentData.treatmentStartTime = treatmentSchedule[0].time;
    const savedTreatment = saveTreatment(treatmentData);
    syncTreatmentAppointmentReminders(treatmentSchedule.map((appointment, index) => ({
        appointmentKey: `${appointment.date}T${appointment.time}`,
        text: [
            `${savedTreatment.treatmentType || "Treatment"} appointment ${index + 1}`,
            formatVisitDate(parseLocalDate(appointment.date)),
            formatTreatmentTime(appointment.time),
            savedTreatment.treatmentLocation
        ].filter(Boolean).join(" • ")
    })));
    fillTreatmentForm(savedTreatment);
    updateTreatmentDirections(savedTreatment);
    renderReminders();
    renderConnectedTreatmentViews();
    treatmentSaveStatus.textContent =
        "Treatment information saved. Appointments were added to the home screen and Reminders.";
});

treatmentOfficeNumberInput.addEventListener("input", validateHospitalPhone);

treatmentPhoneLink.addEventListener("click", event => {
    event.preventDefault();
    if (!callConfirmationDialog.open) {
        callConfirmationDialog.showModal();
    }
});

document.getElementById("cancelHospitalCallBtn").addEventListener("click", () => {
    callConfirmationDialog.close();
});

callConfirmationDialog.addEventListener("keydown", event => {
    if (event.key === "Escape") event.stopPropagation();
});

confirmHospitalCallLink.addEventListener("click", () => {
    callConfirmationDialog.close();
});

updateExpertTreatmentBtn.addEventListener("click", () => {
    if (!currentExpertTreatmentName) {
        treatmentPlanSaveStatus.textContent =
            "Choose a saved treatment to update, or use Create New Treatment.";
        return;
    }
    if (!treatmentPlanForm.reportValidity()) return;

    const updatedTreatment = collectTreatmentPlanFormData();
    const treatments = loadTreatmentDatabase();
    const duplicate = treatments.some(item =>
        normalizeTreatmentName(item.treatmentName) ===
            normalizeTreatmentName(updatedTreatment.treatmentName) &&
        normalizeTreatmentName(item.treatmentName) !==
            normalizeTreatmentName(currentExpertTreatmentName)
    );
    if (duplicate) {
        treatmentPlanSaveStatus.textContent =
            "Another treatment already uses this name.";
        return;
    }

    const previousName = currentExpertTreatmentName;
    const savedTreatments = saveTreatmentDatabase(treatments.map(item =>
        normalizeTreatmentName(item.treatmentName) === normalizeTreatmentName(previousName)
            ? updatedTreatment
            : item
    ));
    const patientTreatment = loadTreatment();
    if (
        normalizeTreatmentName(patientTreatment.treatmentType) ===
        normalizeTreatmentName(previousName)
    ) {
        saveTreatment({
            ...patientTreatment,
            treatmentType: updatedTreatment.treatmentName
        });
    }
    currentExpertTreatmentName = updatedTreatment.treatmentName;
    refreshTreatmentSelectors();
    showExpertTreatment(savedTreatments.find(item =>
        normalizeTreatmentName(item.treatmentName) ===
        normalizeTreatmentName(updatedTreatment.treatmentName)
    ));
    renderConnectedTreatmentViews();
    treatmentPlanSaveStatus.textContent =
        "Current treatment updated. Home and Treatment Journey were refreshed.";
});

treatmentPlanForm.addEventListener("submit", event => {
    event.preventDefault();
});

addTreatmentAppointmentBtn.addEventListener("click", () => {
    if (treatmentScheduleList.children.length >= 100) {
        treatmentSaveStatus.textContent =
            "A treatment schedule can contain no more than 100 appointments.";
        return;
    }
    treatmentScheduleList.appendChild(
        createFractionAppointmentRow({ date: "", time: "" }, treatmentScheduleList.children.length)
    );
    renumberTreatmentRows();
    treatmentScheduleList.lastElementChild.querySelector(".fractionDateInput").focus();
});

treatmentScheduleList.addEventListener("click", event => {
    const removeButton = event.target.closest(".removeFractionButton");
    if (!removeButton) return;
    const row = removeButton.closest(".fractionAppointmentRow");
    if (treatmentScheduleList.children.length === 1) {
        row.querySelector(".fractionDateInput").value = "";
        row.querySelector(".fractionTimeInput").value = "";
    } else {
        row.remove();
    }
    renumberTreatmentRows();
    treatmentSaveStatus.textContent = "";
});

treatmentPlanForm.addEventListener("input", () => {
    treatmentPlanSaveStatus.textContent = "";
});

expertTreatmentSelect.addEventListener("change", () => {
    const selected = loadTreatmentDatabase().find(item =>
        normalizeTreatmentName(item.treatmentName) ===
        normalizeTreatmentName(expertTreatmentSelect.value)
    );
    if (selected) {
        showExpertTreatment(selected);
        treatmentPlanSaveStatus.textContent =
            "Treatment loaded. Edit the form and choose Update Current Treatment to save changes.";
    }
});

newExpertTreatmentBtn.addEventListener("click", () => {
    if (currentExpertTreatmentName) {
        currentExpertTreatmentName = "";
        fillTreatmentPlanForm(EMPTY_EXPERT_TREATMENT);
        expertTreatmentSelect.value = "";
        newExpertTreatmentBtn.textContent = "Save New Treatment";
        updateExpertTreatmentBtn.disabled = true;
        treatmentPlanSaveStatus.textContent =
            "Enter the new expert treatment information, then choose Save New Treatment.";
        document.getElementById("expertTreatmentName").focus();
        return;
    }
    if (!treatmentPlanForm.reportValidity()) return;
    const newTreatment = collectTreatmentPlanFormData();
    const treatments = loadTreatmentDatabase();
    if (treatments.some(item =>
        normalizeTreatmentName(item.treatmentName) ===
        normalizeTreatmentName(newTreatment.treatmentName)
    )) {
        treatmentPlanSaveStatus.textContent =
            "This treatment already exists. Select it and use Update Current Treatment.";
        return;
    }
    const savedTreatments = saveTreatmentDatabase([...treatments, newTreatment]);
    currentExpertTreatmentName = newTreatment.treatmentName;
    refreshTreatmentSelectors();
    showExpertTreatment(savedTreatments[savedTreatments.length - 1]);
    renderConnectedTreatmentViews();
    treatmentPlanSaveStatus.textContent =
        "New treatment created and added to the database dropdown.";
});

document.getElementById("saveExpertDbFileBtn").onclick = saveExpertDatabaseFile;

document.getElementById("saveUserDataFileBtn").onclick = () =>
    saveDataFile("user_data.json", buildUserDataFile);

document.getElementById("loadExpertDbFileBtn").onclick = () =>
    expertDbFileInput.click();

document.getElementById("loadUserDataFileBtn").onclick = () =>
    userDataFileInput.click();

expertDbFileInput.addEventListener("change", () =>
    handleDataFileSelection(
        expertDbFileInput,
        loadExpertDatabaseFile,
        "expertdb.json was loaded. The home page and Treatment Journey were updated."
    )
);

userDataFileInput.addEventListener("change", () =>
    handleDataFileSelection(
        userDataFileInput,
        loadUserDataFile,
        "user_data.json was loaded. Personal information, treatment information, reminders, and documents were restored."
    )
);

treatmentLocationInput.addEventListener("input", () => {
    const query = treatmentLocationInput.value.trim();
    treatmentPlaceIdInput.value = "";
    treatmentSaveStatus.textContent = "";
    clearTimeout(hospitalSearchTimer);

    if (query.length < 3) {
        hospitalSearchController?.abort();
        hideHospitalSuggestions();
        return;
    }

    hospitalSearchTimer = setTimeout(() => searchHospitals(query), 350);
});

treatmentLocationInput.addEventListener("keydown", event => {
    if (hospitalSuggestions.hidden) return;

    if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveHospitalSuggestion(activeHospitalSuggestion + 1);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveHospitalSuggestion(activeHospitalSuggestion - 1);
    } else if (event.key === "Enter" && activeHospitalSuggestion >= 0) {
        event.preventDefault();
        selectHospitalSuggestion(currentHospitalSuggestions[activeHospitalSuggestion]);
    } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        hideHospitalSuggestions();
    }
});

treatmentLocationInput.addEventListener("blur", () => {
    setTimeout(hideHospitalSuggestions, 150);
});

updateGreeting(loadProfile());
refreshTreatmentSelectors();
renderConnectedTreatmentViews();

function appendChat(sender, text) {
    const chatWindow = document.getElementById("chatWindow");
    const div = document.createElement("div");
    div.textContent = `${sender.toUpperCase()}: ${text}`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}
