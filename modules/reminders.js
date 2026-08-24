export function addReminder(text) {
    const reminders = JSON.parse(localStorage.getItem("reminders") || "[]");
    reminders.push({ text, created: Date.now() });
    localStorage.setItem("reminders", JSON.stringify(reminders));
}

export function listReminders() {
    const reminders = JSON.parse(localStorage.getItem("reminders") || "[]");
    return reminders.map(r => r.text);
}

export function syncTreatmentAppointmentReminders(appointments) {
    const reminders = JSON.parse(localStorage.getItem("reminders") || "[]");
    const manualReminders = reminders.filter(
        reminder => reminder.source !== "treatmentAppointment"
    );
    const generatedReminders = appointments.map((appointment, index) => ({
        text: String(appointment.text || "").trim(),
        created: Date.now() + index,
        source: "treatmentAppointment",
        appointmentKey: String(appointment.appointmentKey || "").trim()
    })).filter(reminder => reminder.text);

    localStorage.setItem(
        "reminders",
        JSON.stringify([...manualReminders, ...generatedReminders])
    );
}
