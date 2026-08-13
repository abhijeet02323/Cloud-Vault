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


let currentPrefix = "";


/* ======================================================
   LOAD CURRENT DIRECTORY
====================================================== */

async function loadDirectory(prefix = "") {

    currentPrefix = prefix;

    const grid =
        document.getElementById(
            "driveGrid"
        );

    grid.innerHTML = `
        <div class="drive-loading">
            Loading...
        </div>
    `;


    try {

        const response =
            await fetch(
                `/api/files?prefix=${encodeURIComponent(prefix)}`
            );


        const data =
            await response.json();


        renderBreadcrumb(prefix);

        renderDrive(
            data.folders || [],
            data.files || []
        );


    } catch (error) {

        grid.innerHTML = `
            <div class="drive-error">
                Unable to load directory.
            </div>
        `;

    }

}

function renderDrive(
    folders,
    files
) {

    const grid =
        document.getElementById(
            "driveGrid"
        );


    grid.innerHTML = "";


    /*
       FOLDERS
    */

    folders.forEach(
        folder => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "drive-item folder-item";


            card.innerHTML = `

                <div class="drive-item-icon folder">
                    📁
                </div>

                <div class="drive-item-info">

                    <strong>
                        ${escapeHtml(
                            folder.name
                        )}
                    </strong>

                    <span>
                        Folder
                    </span>

                </div>

                <button
                    class="item-menu"
                    onclick="event.stopPropagation();
                             deleteDriveItem('${escapeAttribute(folder.key)}')">

                    ⋮

                </button>

            `;


            card.addEventListener(
                "dblclick",
                () => {

                    loadDirectory(
                        folder.key
                    );

                }
            );


            grid.appendChild(card);

        }
    );

function renderBreadcrumb(
    prefix
) {

    const breadcrumb =
        document.getElementById(
            "breadcrumb"
        );


    breadcrumb.innerHTML = `
        <button
            onclick="navigateTo('')">

            My Drive

        </button>
    `;


    if (!prefix) {
        return;
    }


    const parts =
        prefix
            .split("/")
            .filter(Boolean);


    let accumulated = "";


    parts.forEach(
        (part, index) => {

            accumulated +=
                part + "/";


            const separator =
                document.createElement(
                    "span"
                );

            separator.textContent =
                " / ";


            breadcrumb.appendChild(
                separator
            );


            const button =
                document.createElement(
                    "button"
                );


            button.textContent =
                part;


            const target =
                accumulated;


            button.onclick = () =>
                navigateTo(target);


            breadcrumb.appendChild(
                button
            );

        }
    );

}


function navigateTo(
    prefix
) {

    loadDirectory(
        prefix
    );

}

    /*
       FILES
    */

    files.forEach(
        file => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "drive-item";


            card.innerHTML = `

                <div class="drive-item-icon file">
                    ${getFileIcon(
                        file.name
                    )}
                </div>

                <div class="drive-item-info">

                    <strong title="${escapeHtml(file.name)}">
                        ${escapeHtml(file.name)}
                    </strong>

                    <span>
                        ${formatBytes(file.size)}
                    </span>

                </div>


                <div class="item-menu-wrapper">

                    <button
                        class="item-menu"
                        onclick="toggleFileMenu(event, '${escapeAttribute(file.key)}')">

                        ⋮

                    </button>

                </div>

            `;


            grid.appendChild(card);

        }
    );


    if (
        folders.length === 0 &&
        files.length === 0
    ) {

        grid.innerHTML = `

            <div class="drive-empty">

                <div>
                    ☁
                </div>

                <h3>
                    This folder is empty
                </h3>

                <p>
                    Create a folder or upload a file.
                </p>

            </div>

        `;

    }

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

    formData.append(
        "prefix",
        currentPrefix
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

function openCreateFolderModal() {

    document
        .getElementById(
            "folderModal"
        )
        .classList.remove(
            "hidden"
        );


    document
        .getElementById(
            "folderName"
        )
        .focus();

}


function closeFolderModal() {

    document
        .getElementById(
            "folderModal"
        )
        .classList.add(
            "hidden"
        );

}


async function createFolder() {

    const input =
        document.getElementById(
            "folderName"
        );


    const name =
        input.value.trim();


    if (!name) {

        showToast(
            "Enter a folder name",
            "error"
        );

        return;

    }


    try {

        const response =
            await fetch(
                "/api/folders",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        name,
                        parent:
                            currentPrefix
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error
            );

        }


        closeFolderModal();

        input.value = "";


        showToast(
            "Folder created successfully"
        );


        loadDirectory(
            currentPrefix
        );


    } catch (error) {

        showToast(
            error.message,
            "error"
        );

    }

}

async function openVersionHistory(
    key
) {

    const modal =
        document.getElementById(
            "versionModal"
        );


    const list =
        document.getElementById(
            "versionList"
        );


    const name =
        document.getElementById(
            "versionFileName"
        );


    name.textContent =
        key.split("/").pop();


    modal.classList.remove(
        "hidden"
    );


    list.innerHTML =
        "Loading versions...";


    try {

        const response =
            await fetch(
                `/api/versions?key=${encodeURIComponent(key)}`
            );


        const data =
            await response.json();


        list.innerHTML = "";


        data.versions.forEach(
            version => {

                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "version-item";


                item.innerHTML = `

                    <div>

                        <strong>

                            ${
                                version.is_latest
                                    ? "Current version"
                                    : "Previous version"
                            }

                        </strong>

                        <span>

                            ${formatDate(
                                version.last_modified
                            )}

                            ·

                            ${formatBytes(
                                version.size
                            )}

                        </span>

                    </div>


                    <button
                        class="secondary-button"
                        onclick="downloadVersion(
                            '${escapeAttribute(key)}',
                            '${escapeAttribute(version.version_id)}'
                        )">

                        ↓

                    </button>

                `;


                list.appendChild(
                    item
                );

            }
        );


    } catch (error) {

        list.innerHTML =
            "Unable to load versions.";

    }

}


function closeVersionModal() {

    document
        .getElementById(
            "versionModal"
        )
        .classList.add(
            "hidden"
        );

}


async function downloadVersion(
    key,
    versionId
) {

    const response =
        await fetch(
            `/api/version-download?key=${encodeURIComponent(key)}&version_id=${encodeURIComponent(versionId)}`
        );


    const data =
        await response.json();


    if (data.url) {

        window.open(
            data.url,
            "_blank"
        );

    }

}