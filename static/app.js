const API_URL = "/files";

let allFiles = [];
let fileToUpdate = null;


/* =========================
   DOM ELEMENTS
========================= */

const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const dropZone = document.getElementById("dropZone");

const fileTableBody =
    document.getElementById("fileTableBody");

const loading =
    document.getElementById("loading");

const emptyState =
    document.getElementById("emptyState");

const searchInput =
    document.getElementById("searchInput");

const totalFiles =
    document.getElementById("totalFiles");

const totalStorage =
    document.getElementById("totalStorage");

const storageText =
    document.getElementById("storageText");

const storagePercent =
    document.getElementById("storagePercent");

const storageBar =
    document.getElementById("storageBar");

const refreshBtn =
    document.getElementById("refreshBtn");

const refreshFilesBtn =
    document.getElementById("refreshFilesBtn");

const uploadHeroBtn =
    document.getElementById("uploadHeroBtn");

const uploadProgressContainer =
    document.getElementById(
        "uploadProgressContainer"
    );

const uploadProgress =
    document.getElementById("uploadProgress");

const uploadPercentage =
    document.getElementById("uploadPercentage");

const uploadFileName =
    document.getElementById("uploadFileName");


/* Modal */

const updateModal =
    document.getElementById("updateModal");

const closeModal =
    document.getElementById("closeModal");

const updateFileInput =
    document.getElementById("updateFileInput");

const updateBtn =
    document.getElementById("updateBtn");

const updateFileName =
    document.getElementById("updateFileName");


/* Toast */

const toast =
    document.getElementById("toast");

const toastMessage =
    document.getElementById("toastMessage");


/* =========================
   INITIAL LOAD
========================= */

document.addEventListener(
    "DOMContentLoaded",
    loadFiles
);


/* =========================
   LOAD FILES
========================= */

async function loadFiles() {

    loading.classList.remove("hidden");

    emptyState.classList.add("hidden");

    fileTableBody.innerHTML = "";

    try {

        const response =
            await fetch(API_URL);

        if (!response.ok) {
            throw new Error(
                "Unable to load files"
            );
        }

        const data =
            await response.json();

        allFiles = data.files || [];

        renderFiles(allFiles);

        updateStatistics(allFiles);

    } catch (error) {

        showToast(
            error.message,
            "error"
        );

    } finally {

        loading.classList.add("hidden");

    }

}


/* =========================
   RENDER FILES
========================= */

function renderFiles(files) {

    fileTableBody.innerHTML = "";

    if (files.length === 0) {

        emptyState.classList.remove(
            "hidden"
        );

        return;
    }

    emptyState.classList.add(
        "hidden"
    );


    files.forEach(file => {

        const row =
            document.createElement("tr");

        row.innerHTML = `

            <td>

                <div class="file-name">

                    <div class="file-icon">
                        ${getFileIcon(file.filename)}
                    </div>

                    <div class="file-info">

                        <strong title="${escapeHtml(file.filename)}">
                            ${escapeHtml(file.filename)}
                        </strong>

                        <span>
                            ${getExtension(file.filename)}
                        </span>

                    </div>

                </div>

            </td>


            <td>
                ${formatBytes(file.size)}
            </td>


            <td>
                ${formatDate(file.last_modified)}
            </td>


            <td>

                <div class="actions">

                    <button
                        class="action-btn"
                        title="Download"
                        onclick="downloadFile('${encodeURIComponent(file.filename)}')">

                        ↓

                    </button>


                    <button
                        class="action-btn"
                        title="Replace"
                        onclick="openUpdateModal('${escapeAttribute(file.filename)}')">

                        ↻

                    </button>


                    <button
                        class="action-btn delete"
                        title="Delete"
                        onclick="deleteFile('${escapeAttribute(file.filename)}')">

                        ×

                    </button>

                </div>

            </td>
        `;

        fileTableBody.appendChild(row);

    });

}


/* =========================
   UPLOAD
========================= */

browseBtn.addEventListener(
    "click",
    () => fileInput.click()
);


uploadHeroBtn.addEventListener(
    "click",
    () => {

        document
            .getElementById("upload")
            .scrollIntoView({
                behavior: "smooth"
            });

        setTimeout(
            () => fileInput.click(),
            400
        );

    }
);


fileInput.addEventListener(
    "change",
    event => {

        const file =
            event.target.files[0];

        if (file) {
            uploadFile(file);
        }

    }
);


/* =========================
   DRAG & DROP
========================= */

dropZone.addEventListener(
    "dragover",
    event => {

        event.preventDefault();

        dropZone.classList.add(
            "dragging"
        );

    }
);


dropZone.addEventListener(
    "dragleave",
    () => {

        dropZone.classList.remove(
            "dragging"
        );

    }
);


dropZone.addEventListener(
    "drop",
    event => {

        event.preventDefault();

        dropZone.classList.remove(
            "dragging"
        );

        const file =
            event.dataTransfer.files[0];

        if (file) {
            uploadFile(file);
        }

    }
);


dropZone.addEventListener(
    "click",
    event => {

        if (
            event.target === dropZone ||
            event.target.closest(".upload-icon") ||
            event.target.tagName === "H3" ||
            event.target.tagName === "P"
        ) {

            fileInput.click();

        }

    }
);


/* =========================
   UPLOAD REQUEST
========================= */

function uploadFile(file) {

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    uploadFileName.textContent =
        file.name;

    uploadProgressContainer
        .classList.remove("hidden");

    uploadProgress.style.width =
        "0%";

    uploadPercentage.textContent =
        "0%";


    const xhr =
        new XMLHttpRequest();

    xhr.open(
        "POST",
        API_URL
    );


    xhr.upload.addEventListener(
        "progress",
        event => {

            if (event.lengthComputable) {

                const percent =
                    Math.round(
                        (event.loaded /
                        event.total) *
                        100
                    );

                uploadProgress.style.width =
                    `${percent}%`;

                uploadPercentage.textContent =
                    `${percent}%`;

            }

        }
    );


    xhr.onload = () => {

        if (
            xhr.status >= 200 &&
            xhr.status < 300
        ) {

            showToast(
                "File uploaded successfully"
            );

            loadFiles();

        } else {

            let message =
                "Upload failed";

            try {

                const data =
                    JSON.parse(
                        xhr.responseText
                    );

                message =
                    data.error || message;

            } catch {}

            showToast(
                message,
                "error"
            );

        }

        setTimeout(
            () => {

                uploadProgressContainer
                    .classList.add(
                        "hidden"
                    );

            },
            1000
        );

    };


    xhr.onerror = () => {

        showToast(
            "Network error during upload",
            "error"
        );

        uploadProgressContainer
            .classList.add(
                "hidden"
            );

    };


    xhr.send(formData);

}


/* =========================
   DOWNLOAD
========================= */

function downloadFile(filename) {

    const decoded =
        decodeURIComponent(filename);

    window.location.href =
        `${API_URL}/${encodeURIComponent(decoded)
            .replace(/%2F/g, "/")}`;

}


/* =========================
   UPDATE MODAL
========================= */

function openUpdateModal(filename) {

    fileToUpdate = filename;

    updateFileName.textContent =
        filename;

    updateFileInput.value = "";

    updateModal.classList.remove(
        "hidden"
    );

}


closeModal.addEventListener(
    "click",
    () => {

        updateModal.classList.add(
            "hidden"
        );

    }
);


updateModal.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            updateModal
        ) {

            updateModal.classList.add(
                "hidden"
            );

        }

    }
);


updateBtn.addEventListener(
    "click",
    updateFile
);


/* =========================
   UPDATE FILE
========================= */

async function updateFile() {

    const file =
        updateFileInput.files[0];

    if (!file) {

        showToast(
            "Please select a file",
            "error"
        );

        return;
    }


    updateBtn.disabled = true;

    updateBtn.textContent =
        "Replacing...";


    try {

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );


        const encodedFilename =
            encodeURIComponent(
                fileToUpdate
            ).replace(
                /%2F/g,
                "/"
            );


        const response =
            await fetch(
                `${API_URL}/${encodedFilename}`,
                {
                    method: "PUT",
                    body: formData
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Update failed"
            );

        }


        showToast(
            "File updated successfully"
        );


        updateModal.classList.add(
            "hidden"
        );


        loadFiles();


    } catch (error) {

        showToast(
            error.message,
            "error"
        );

    } finally {

        updateBtn.disabled = false;

        updateBtn.textContent =
            "Replace File";

    }

}


/* =========================
   DELETE
========================= */

async function deleteFile(filename) {

    if (
        !confirm(
            `Delete "${filename}"?\n\nThis action cannot be undone.`
        )
    ) {
        return;
    }


    try {

        const encodedFilename =
            encodeURIComponent(
                filename
            ).replace(
                /%2F/g,
                "/"
            );


        const response =
            await fetch(
                `${API_URL}/${encodedFilename}`,
                {
                    method: "DELETE"
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Delete failed"
            );

        }


        showToast(
            "File deleted successfully"
        );


        loadFiles();


    } catch (error) {

        showToast(
            error.message,
            "error"
        );

    }

}


/* =========================
   SEARCH
========================= */

searchInput.addEventListener(
    "input",
    event => {

        const query =
            event.target.value
                .toLowerCase()
                .trim();


        const filtered =
            allFiles.filter(
                file =>
                    file.filename
                        .toLowerCase()
                        .includes(query)
            );


        renderFiles(filtered);

    }
);


/* =========================
   STATISTICS
========================= */

function updateStatistics(files) {

    const total =
        files.length;

    const size =
        files.reduce(
            (sum, file) =>
                sum + file.size,
            0
        );


    totalFiles.textContent =
        total;

    totalStorage.textContent =
        formatBytes(size);

    storageText.textContent =
        `${formatBytes(size)} used`;


    /*
       Example storage limit:
       5 GB
    */

    const storageLimit =
        5 * 1024 * 1024 * 1024;


    const percentage =
        Math.min(
            (size / storageLimit) * 100,
            100
        );


    storageBar.style.width =
        `${percentage}%`;

    storagePercent.textContent =
        `${percentage.toFixed(1)}%`;

}


/* =========================
   REFRESH
========================= */

refreshBtn.addEventListener(
    "click",
    loadFiles
);


refreshFilesBtn.addEventListener(
    "click",
    loadFiles
);


/* =========================
   UTILITIES
========================= */

function formatBytes(bytes) {

    if (bytes === 0) {
        return "0 B";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];

    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );

    return (
        parseFloat(
            (bytes /
            Math.pow(
                1024,
                index
            )).toFixed(2)
        ) +
        " " +
        units[index]
    );

}


function formatDate(date) {

    return new Date(date)
        .toLocaleString(
            undefined,
            {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
        );

}


function getExtension(filename) {

    const parts =
        filename.split(".");

    if (parts.length === 1) {
        return "FILE";
    }

    return parts
        .pop()
        .toUpperCase();

}


function getFileIcon(filename) {

    const extension =
        getExtension(filename);

    const icons = {

        PDF: "▤",

        PNG: "▧",
        JPG: "▧",
        JPEG: "▧",
        GIF: "▧",
        WEBP: "▧",

        MP4: "▶",
        MKV: "▶",
        AVI: "▶",

        MP3: "♫",
        WAV: "♫",

        ZIP: "◆",
        RAR: "◆",

        DOC: "▤",
        DOCX: "▤",

        XLS: "▦",
        XLSX: "▦",

        CSV: "▦"

    };


    return icons[extension] || "□";

}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function escapeAttribute(value) {

    return String(value)
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");
}


function showToast(
    message,
    type = "success"
) {

    toastMessage.textContent =
        message;


    const icon =
        document.getElementById(
            "toastIcon"
        );


    icon.textContent =
        type === "error"
            ? "!"
            : "✓";


    icon.style.color =
        type === "error"
            ? "var(--red)"
            : "var(--green)";


    toast.classList.add(
        "show"
    );


    setTimeout(
        () => {

            toast.classList.remove(
                "show"
            );

        },
        3000
    );

}