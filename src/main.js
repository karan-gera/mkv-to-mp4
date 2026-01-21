const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

// DOM Elements
let dropZone;
let browseBtn;
let statusArea;
let statusHeaderText;
let statusCount;
let statusList;
let progressContainer;
let progressBar;
let ffmpegModal;
let installFfmpegBtn;
let manualInstallBtn;
let manualInstructions;
let retryBtn;
let installingModal;
let installStatus;

// State
let pendingFiles = [];
let conversionQueue = [];
let completedCount = 0;
let errorCount = 0;
let isConverting = false;

window.addEventListener("DOMContentLoaded", () => {
  // Get DOM elements
  dropZone = document.getElementById("drop-zone");
  browseBtn = document.getElementById("browse-btn");
  statusArea = document.getElementById("status-area");
  statusHeaderText = document.getElementById("status-header-text");
  statusCount = document.getElementById("status-count");
  statusList = document.getElementById("status-list");
  progressContainer = document.getElementById("progress-container");
  progressBar = document.getElementById("progress-bar");
  ffmpegModal = document.getElementById("ffmpeg-modal");
  installFfmpegBtn = document.getElementById("install-ffmpeg-btn");
  manualInstallBtn = document.getElementById("manual-install-btn");
  manualInstructions = document.getElementById("manual-instructions");
  retryBtn = document.getElementById("retry-btn");
  installingModal = document.getElementById("installing-modal");
  installStatus = document.getElementById("install-status");

  // Setup event listeners
  setupDragAndDrop();
  setupBrowseButton();
  setupModalButtons();
  setupTauriListeners();
});

function setupDragAndDrop() {
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

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
        multiple: true,
        filters: [{
          name: "Video Files",
          extensions: ["mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg", "3gp"]
        }]
      });
      
      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected];
        if (files.length > 0) {
          handleFiles(files);
        }
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
      
      if (pendingFiles.length > 0) {
        await handleFiles(pendingFiles);
      }
    } catch (err) {
      installingModal.classList.add("hidden");
      showError(`install failed: ${err}`);
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
    
    if (pendingFiles.length > 0) {
      await handleFiles(pendingFiles);
    }
  });
}

function setupTauriListeners() {
  listen("tauri://drag-drop", (event) => {
    const paths = event.payload.paths;
    if (paths && paths.length > 0) {
      handleFiles(paths);
    }
  });
}

async function handleFiles(filePaths) {
  pendingFiles = filePaths;
  
  // Check if ffmpeg is available
  const hasFfmpeg = await invoke("check_ffmpeg");
  
  if (!hasFfmpeg) {
    ffmpegModal.classList.remove("hidden");
    return;
  }
  
  // Reset state
  conversionQueue = filePaths.map(path => ({
    path,
    filename: path.split(/[/\\]/).pop(),
    status: 'pending',
    output: null,
    error: null
  }));
  completedCount = 0;
  errorCount = 0;
  isConverting = true;
  
  // Show status area
  statusArea.classList.remove("hidden");
  progressContainer.classList.remove("hidden");
  updateStatusUI();
  
  // Process files sequentially
  for (let i = 0; i < conversionQueue.length; i++) {
    const item = conversionQueue[i];
    item.status = 'converting';
    updateStatusUI();
    
    try {
      const outputPath = await invoke("convert_file", { inputPath: item.path });
      item.status = 'done';
      item.output = outputPath.split(/[/\\]/).pop();
      completedCount++;
    } catch (err) {
      item.status = 'error';
      item.error = err;
      errorCount++;
    }
    
    updateStatusUI();
    updateProgress((i + 1) / conversionQueue.length);
  }
  
  isConverting = false;
  pendingFiles = [];
  updateStatusUI();
  
  // Hide progress after delay
  setTimeout(() => {
    progressContainer.classList.add("hidden");
    progressBar.style.width = "0%";
  }, 2000);
}

function updateStatusUI() {
  const total = conversionQueue.length;
  const done = completedCount + errorCount;
  
  if (isConverting) {
    statusHeaderText.textContent = "converting";
  } else if (errorCount > 0 && completedCount > 0) {
    statusHeaderText.textContent = "completed with errors";
  } else if (errorCount > 0) {
    statusHeaderText.textContent = "failed";
  } else {
    statusHeaderText.textContent = "done";
  }
  
  statusCount.textContent = `${done}/${total}`;
  
  // Build status list
  statusList.innerHTML = conversionQueue.map(item => {
    let stateText = '';
    let stateClass = '';
    
    switch (item.status) {
      case 'pending':
        stateText = 'waiting';
        break;
      case 'converting':
        stateText = 'converting...';
        break;
      case 'done':
        stateText = '→ ' + item.output;
        stateClass = 'done';
        break;
      case 'error':
        stateText = 'failed';
        stateClass = 'error';
        break;
    }
    
    return `
      <div class="status-item">
        <span class="filename">${item.filename}</span>
        <span class="state ${stateClass}">${stateText}</span>
      </div>
    `;
  }).join('');
}

function updateProgress(ratio) {
  progressBar.style.width = `${Math.round(ratio * 100)}%`;
}

function showError(message) {
  statusArea.classList.remove("hidden");
  statusList.innerHTML = `<div class="status-item"><span class="state error">${message}</span></div>`;
}
