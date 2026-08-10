export function addReminder(text) {
    const reminders = JSON.parse(localStorage.getItem("reminders") || "[]");
    reminders.push({ text, created: Date.now() });
    localStorage.setItem("reminders", JSON.stringify(reminders));
}

export function listReminders() {
    const reminders = JSON.parse(localStorage.getItem("reminders") || "[]");
    return reminders.map(r => r.text);
}
