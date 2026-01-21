const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

// DOM Elements
let dropZone;
let browseBtn;
let statusArea;
let statusText;
let progressContainer;
let progressBar;
let ffmpegModal;
let installFfmpegBtn;
let manualInstallBtn;
let manualInstructions;
let retryBtn;
let installingModal;
let installStatus;
let installProgressBar;

// State
let pendingFile = null;

window.addEventListener("DOMContentLoaded", () => {
  // Get DOM elements
  dropZone = document.getElementById("drop-zone");
  browseBtn = document.getElementById("browse-btn");
  statusArea = document.getElementById("status-area");
  statusText = document.getElementById("status-text");
  progressContainer = document.getElementById("progress-container");
  progressBar = document.getElementById("progress-bar");
  ffmpegModal = document.getElementById("ffmpeg-modal");
  installFfmpegBtn = document.getElementById("install-ffmpeg-btn");
  manualInstallBtn = document.getElementById("manual-install-btn");
  manualInstructions = document.getElementById("manual-instructions");
  retryBtn = document.getElementById("retry-btn");
  installingModal = document.getElementById("installing-modal");
  installStatus = document.getElementById("install-status");
  installProgressBar = document.getElementById("install-progress-bar");

  // Setup event listeners
  setupDragAndDrop();
  setupBrowseButton();
  setupModalButtons();
  
  // Listen for Tauri events
  setupTauriListeners();
});

function setupDragAndDrop() {
  // Prevent default drag behaviors on window
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  // Highlight drop zone when dragging over
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove("drag-over");
    });
  });

  // Handle drop
  dropZone.addEventListener("drop", async (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // Get the file path from the dropped file
      const file = files[0];
      // In Tauri, we need to get the path differently
      // The file object doesn't have a path property in the browser
      // We need to use the Tauri drag-drop event instead
    }
  });

  // Click on drop zone to browse
  dropZone.addEventListener("click", (e) => {
    if (e.target !== browseBtn) {
      browseBtn.click();
    }
  });
}

function setupBrowseButton() {
  browseBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: "Video Files",
          extensions: ["mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg", "3gp"]
        }]
      });
      
      if (selected) {
        handleFile(selected);
      }
    } catch (err) {
      console.error("Error opening file dialog:", err);
    }
  });
}

function setupModalButtons() {
  installFfmpegBtn.addEventListener("click", async () => {
    ffmpegModal.classList.add("hidden");
    installingModal.classList.remove("hidden");
    
    try {
      await invoke("install_ffmpeg");
      installingModal.classList.add("hidden");
      showStatus("ffmpeg installed successfully!", "success");
      
      // Retry conversion if there was a pending file
      if (pendingFile) {
        await handleFile(pendingFile);
      }
    } catch (err) {
      installingModal.classList.add("hidden");
      showStatus(`Failed to install ffmpeg: ${err}`, "error");
    }
  });

  manualInstallBtn.addEventListener("click", () => {
    manualInstructions.classList.remove("hidden");
    manualInstallBtn.classList.add("hidden");
    installFfmpegBtn.classList.add("hidden");
  });

  retryBtn.addEventListener("click", async () => {
    ffmpegModal.classList.add("hidden");
    manualInstructions.classList.add("hidden");
    manualInstallBtn.classList.remove("hidden");
    installFfmpegBtn.classList.remove("hidden");
    
    if (pendingFile) {
      await handleFile(pendingFile);
    }
  });
}

function setupTauriListeners() {
  // Listen for file drop events from Tauri
  listen("tauri://drag-drop", (event) => {
    const paths = event.payload.paths;
    if (paths && paths.length > 0) {
      handleFile(paths[0]);
    }
  });
}

async function handleFile(filePath) {
  pendingFile = filePath;
  
  // Show status area
  statusArea.classList.remove("hidden");
  progressContainer.classList.remove("hidden");
  progressBar.style.width = "0%";
  
  // Get filename for display
  const filename = filePath.split(/[/\\]/).pop();
  showStatus(`Converting: ${filename}...`);
  
  try {
    // Check if ffmpeg is available
    const hasFfmpeg = await invoke("check_ffmpeg");
    
    if (!hasFfmpeg) {
      progressContainer.classList.add("hidden");
      ffmpegModal.classList.remove("hidden");
      showStatus("ffmpeg not found", "error");
      return;
    }
    
    // Start conversion
    progressBar.style.width = "10%";
    const outputPath = await invoke("convert_file", { inputPath: filePath });
    
    progressBar.style.width = "100%";
    const outputFilename = outputPath.split(/[/\\]/).pop();
    showStatus(`Done! Saved as: ${outputFilename}`, "success");
    pendingFile = null;
    
    // Reset progress after a delay
    setTimeout(() => {
      progressContainer.classList.add("hidden");
      progressBar.style.width = "0%";
    }, 3000);
    
  } catch (err) {
    progressContainer.classList.add("hidden");
    showStatus(`Error: ${err}`, "error");
  }
}

function showStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = "status-text";
  if (type) {
    statusText.classList.add(type);
  }
  statusArea.classList.remove("hidden");
}
