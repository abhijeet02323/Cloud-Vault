const API = "/api";
let currentPrefix = "";
let items = [];
let replaceKey = null;

const $ = (selector) => document.querySelector(selector);
const fileList = $("#fileList");
const emptyState = $("#emptyState");
const toast = $("#toast");

document.addEventListener("DOMContentLoaded", () => {
  $("#uploadButton").addEventListener("click", () => $("#fileInput").click());
  $("#newButton").addEventListener("click", () => $("#folderModal").classList.remove("hidden"));
  $("#folderButton").addEventListener("click", () => $("#folderModal").classList.remove("hidden"));
  $("#refreshButton").addEventListener("click", loadDirectory);
  $("#myStorageButton").addEventListener("click", () => loadDirectory(""));
  $("#fileInput").addEventListener("change", (event) => upload(event.target.files[0]));
  $("#replaceInput").addEventListener("change", (event) => replace(event.target.files[0]));
  $("#searchInput").addEventListener("input", render);
  $("#folderForm").addEventListener("submit", createFolder);
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeFolderModal));
  document.querySelectorAll("[data-close-versions]").forEach((button) => button.addEventListener("click", closeVersionsModal));
  $("#enableVersioning").addEventListener("click", enableVersioning);
  $("#dropZone").addEventListener("dragover", (event) => { event.preventDefault(); $("#dropZone").classList.add("dragging"); });
  $("#dropZone").addEventListener("dragleave", () => $("#dropZone").classList.remove("dragging"));
  $("#dropZone").addEventListener("drop", (event) => { event.preventDefault(); $("#dropZone").classList.remove("dragging"); upload(event.dataTransfer.files[0]); });
  loadDirectory();
  loadVersioningStatus();
});

async function loadDirectory(prefix = currentPrefix) {
  currentPrefix = prefix;
  fileList.innerHTML = '<div class="loading">Loading storage…</div>';
  emptyState.classList.add("hidden");
  try {
    const response = await fetch(`${API}/files?prefix=${encodeURIComponent(currentPrefix)}`);
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to load storage");
    items = [...data.folders.map((folder) => ({ ...folder, folder: true })), ...data.files];
    $("#summary").textContent = `${data.files.length} file${data.files.length === 1 ? "" : "s"} in this folder`;
    renderBreadcrumb();
    render();
  } catch (error) {
    fileList.innerHTML = "";
    showToast(error.message, true);
  }
}

function renderBreadcrumb() {
  const breadcrumb = $("#breadcrumb");
  breadcrumb.replaceChildren();
  const root = document.createElement("button");
  root.textContent = "My storage";
  root.addEventListener("click", () => loadDirectory(""));
  breadcrumb.append(root);
  let prefix = "";
  currentPrefix.split("/").filter(Boolean).forEach((part) => {
    prefix += `${part}/`;
    const separator = document.createElement("span");
    separator.textContent = "›";
    const button = document.createElement("button");
    button.textContent = part;
    const destination = prefix;
    button.addEventListener("click", () => loadDirectory(destination));
    breadcrumb.append(separator, button);
  });
}

function render() {
  const query = $("#searchInput").value.toLocaleLowerCase().trim();
  const visible = items.filter((item) => item.name.toLocaleLowerCase().includes(query));
  fileList.replaceChildren();
  emptyState.classList.toggle("hidden", visible.length !== 0);
  visible.forEach((item) => fileList.append(createRow(item)));
}

function createRow(item) {
  const row = document.createElement("article");
  row.className = "file-row";
  const name = document.createElement("button");
  name.className = "file-name";
  name.innerHTML = `<span class="file-icon ${item.folder ? "folder-icon" : ""}">${item.folder ? "■" : fileIcon(item.name)}</span><span>${escapeHtml(item.name)}</span>`;
  if (item.folder) name.addEventListener("click", () => loadDirectory(item.key));
  else name.addEventListener("dblclick", () => download(item.key));
  const size = document.createElement("span");
  size.textContent = item.folder ? "Folder" : formatBytes(item.size);
  const modified = document.createElement("span");
  modified.textContent = item.folder ? "" : formatDate(item.last_modified);
  const actions = document.createElement("div");
  actions.className = "actions";
  if (!item.folder) {
    actions.append(actionButton("↓", "Download", () => download(item.key)));
    actions.append(actionButton("↻", "Replace", () => { replaceKey = item.key; $("#replaceInput").click(); }));
    actions.append(actionButton("◷", "Version history", () => openVersions(item)));
  }
  actions.append(actionButton("⋮", "Delete", () => remove(item)));
  row.append(name, size, modified, actions);
  return row;
}

function actionButton(symbol, label, handler) {
  const button = document.createElement("button");
  button.className = "action-button";
  button.textContent = symbol;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", handler);
  return button;
}

function upload(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  form.append("prefix", currentPrefix);
  requestUpload("POST", `${API}/files`, form, file.name, "File uploaded");
}

function replace(file) {
  if (!file || !replaceKey) return;
  const form = new FormData();
  form.append("file", file);
  form.append("key", replaceKey);
  requestUpload("PUT", `${API}/files`, form, file.name, "File replaced");
  replaceKey = null;
}

function requestUpload(method, url, body, name, successMessage) {
  const status = $("#uploadStatus");
  $("#uploadName").textContent = name;
  status.classList.remove("hidden");
  const xhr = new XMLHttpRequest();
  xhr.open(method, url);
  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const percent = Math.round((event.loaded / event.total) * 100);
    $("#uploadProgress").style.width = `${percent}%`;
    $("#uploadPercent").textContent = `${percent}%`;
  };
  xhr.onload = () => {
    status.classList.add("hidden");
    if (xhr.status >= 200 && xhr.status < 300) { showToast(successMessage); loadDirectory(); }
    else { let message = "Upload failed"; try { message = JSON.parse(xhr.responseText).error || message; } catch (_) {} showToast(message, true); }
  };
  xhr.onerror = () => { status.classList.add("hidden"); showToast("Network error while uploading", true); };
  xhr.send(body);
}

async function download(key) {
  try {
    const response = await fetch(`${API}/download?key=${encodeURIComponent(key)}`);
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to prepare download");
    window.location.assign(data.url);
  } catch (error) { showToast(error.message, true); }
}

async function remove(item) {
  if (!window.confirm(`Delete ${item.folder ? "folder" : "file"} “${item.name}”?`)) return;
  try {
    const response = await fetch(`${API}/files?key=${encodeURIComponent(item.key)}`, { method: "DELETE" });
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to delete");
    showToast("Deleted");
    loadDirectory();
  } catch (error) { showToast(error.message, true); }
}

async function createFolder(event) {
  event.preventDefault();
  const name = $("#folderName").value.trim();
  try {
    const response = await fetch(`${API}/folders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parent: currentPrefix }) });
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to create folder");
    closeFolderModal();
    $("#folderName").value = "";
    showToast("Folder created");
    loadDirectory();
  } catch (error) { showToast(error.message, true); }
}

async function loadVersioningStatus() {
  try {
    const response = await fetch(`${API}/versioning`);
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to check S3 versioning");
    $("#versioningNotice").classList.toggle("hidden", data.enabled);
  } catch (error) { showToast(error.message, true); }
}

async function enableVersioning() {
  const button = $("#enableVersioning");
  button.disabled = true;
  button.textContent = "Enabling…";
  try {
    const response = await fetch(`${API}/versioning`, { method: "POST" });
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to enable versioning");
    $("#versioningNotice").classList.add("hidden");
    showToast("S3 versioning enabled. Future replacements will be retained.");
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; button.textContent = "Enable versioning"; }
}

async function openVersions(item) {
  const modal = $("#versionsModal");
  const list = $("#versionsList");
  $("#versionFileName").textContent = item.name;
  list.innerHTML = '<div class="loading">Loading version history…</div>';
  modal.classList.remove("hidden");
  try {
    const response = await fetch(`${API}/versions?key=${encodeURIComponent(item.key)}`);
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to load version history");
    list.replaceChildren();
    if (!data.versions.length) {
      list.innerHTML = '<p class="no-versions">No saved versions. Enable S3 versioning, then replace this file to retain previous versions.</p>';
      return;
    }
    data.versions.forEach((version) => list.append(versionRow(item.key, version)));
  } catch (error) { list.innerHTML = `<p class="no-versions">${escapeHtml(error.message)}</p>`; }
}

function versionRow(key, version) {
  const row = document.createElement("div");
  row.className = "version-row";
  const description = document.createElement("div");
  description.innerHTML = `<strong>${version.is_latest ? "Current version" : "Previous version"}</strong><span>${formatDateTime(version.last_modified)} · ${formatBytes(version.size)}</span>`;
  const actions = document.createElement("div");
  actions.className = "version-actions";
  actions.append(actionButton("↓", "Download this version", () => downloadVersion(key, version.version_id)));
  if (!version.is_latest) actions.append(actionButton("↺", "Restore this version", () => restoreVersion(key, version.version_id)));
  row.append(description, actions);
  return row;
}

async function downloadVersion(key, versionId) {
  try {
    const response = await fetch(`${API}/version-download?key=${encodeURIComponent(key)}&version_id=${encodeURIComponent(versionId)}`);
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to prepare version download");
    window.location.assign(data.url);
  } catch (error) { showToast(error.message, true); }
}

async function restoreVersion(key, versionId) {
  if (!window.confirm("Restore this version as the current file? The current file will become a new saved version.")) return;
  try {
    const response = await fetch(`${API}/versions/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, version_id: versionId }) });
    const data = await json(response);
    if (!response.ok) throw new Error(data.error || "Unable to restore version");
    showToast("Version restored");
    closeVersionsModal();
    loadDirectory();
  } catch (error) { showToast(error.message, true); }
}

function closeFolderModal() { $("#folderModal").classList.add("hidden"); }
function closeVersionsModal() { $("#versionsModal").classList.add("hidden"); }
async function json(response) { try { return await response.json(); } catch (_) { return {}; } }
function showToast(message, error = false) { toast.textContent = message; toast.className = `toast show${error ? " error" : ""}`; window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.className = "toast", 3500); }
function formatBytes(size) { if (size === 0) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1); return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function formatDate(date) { return date ? new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"; }
function formatDateTime(date) { return date ? new Date(date).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
function fileIcon(name) { const ext = name.split(".").pop().toLowerCase(); if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "▧"; if (["pdf"].includes(ext)) return "▤"; if (["doc", "docx"].includes(ext)) return "▤"; if (["xls", "xlsx", "csv"].includes(ext)) return "▦"; if (["mp3", "wav", "mp4", "mov"].includes(ext)) return "◖"; return "▱"; }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
