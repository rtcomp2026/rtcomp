export function saveDocument(name, content) {
    const docs = JSON.parse(localStorage.getItem("docs") || "{}");
    docs[name] = content;
    localStorage.setItem("docs", JSON.stringify(docs));
}

export function loadDocuments() {
    return JSON.parse(localStorage.getItem("docs") || "{}");
}
