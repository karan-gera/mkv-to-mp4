use std::path::PathBuf;
use std::process::Command;

/// Common ffmpeg locations to check on macOS
#[cfg(target_os = "macos")]
const FFMPEG_PATHS: &[&str] = &[
    "/opt/homebrew/bin/ffmpeg",      // Homebrew on Apple Silicon
    "/usr/local/bin/ffmpeg",          // Homebrew on Intel / manual install
    "/usr/bin/ffmpeg",                // System install
];

/// Common ffmpeg locations to check on Windows
#[cfg(target_os = "windows")]
const FFMPEG_PATHS: &[&str] = &[
    "ffmpeg",  // In PATH
    "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
];

/// Common ffmpeg locations to check on Linux
#[cfg(target_os = "linux")]
const FFMPEG_PATHS: &[&str] = &[
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/snap/bin/ffmpeg",
];

/// Find ffmpeg binary path
fn find_ffmpeg() -> Option<String> {
    // First check common locations
    for path in FFMPEG_PATHS {
        let path_buf = PathBuf::from(path);
        if path_buf.exists() || path == &"ffmpeg" {
            // Verify it actually works
            #[cfg(target_os = "windows")]
            let result = Command::new("cmd")
                .args(["/C", path, "-version"])
                .output();

            #[cfg(not(target_os = "windows"))]
            let result = Command::new(path)
                .arg("-version")
                .output();

            if let Ok(output) = result {
                if output.status.success() {
                    return Some(path.to_string());
                }
            }
        }
    }

    // Check user's local bin (for our downloaded binary)
    if let Some(home) = dirs::home_dir() {
        #[cfg(target_os = "macos")]
        let local_ffmpeg = home.join(".local/bin/ffmpeg");
        
        #[cfg(target_os = "windows")]
        let local_ffmpeg = home.join("AppData\\Local\\ffmpeg\\ffmpeg.exe");
        
        #[cfg(target_os = "linux")]
        let local_ffmpeg = home.join(".local/bin/ffmpeg");

        if local_ffmpeg.exists() {
            let path_str = local_ffmpeg.to_string_lossy().to_string();
            
            #[cfg(target_os = "windows")]
            let result = Command::new("cmd")
                .args(["/C", &path_str, "-version"])
                .output();

            #[cfg(not(target_os = "windows"))]
            let result = Command::new(&path_str)
                .arg("-version")
                .output();

            if let Ok(output) = result {
                if output.status.success() {
                    return Some(path_str);
                }
            }
        }
    }

    None
}

/// Check if ffmpeg is available
#[tauri::command]
fn check_ffmpeg() -> bool {
    find_ffmpeg().is_some()
}

/// Generate a unique output path that doesn't overwrite existing files
fn get_unique_output_path(input_path: &str) -> PathBuf {
    let path = PathBuf::from(input_path);
    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    
    let mut output_path = parent.join(format!("{}.mp4", stem));
    
    // If file exists, append _1, _2, etc.
    let mut counter = 1;
    while output_path.exists() {
        output_path = parent.join(format!("{}_{}.mp4", stem, counter));
        counter += 1;
    }
    
    output_path
}

/// Convert a video file to MP4 using ffmpeg
#[tauri::command]
fn convert_file(input_path: String) -> Result<String, String> {
    let ffmpeg_path = find_ffmpeg().ok_or("ffmpeg not found")?;
    
    let output_path = get_unique_output_path(&input_path);
    let output_str = output_path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    let result = Command::new("cmd")
        .args(["/C", &ffmpeg_path, "-i", &input_path, "-codec", "copy", "-y", &output_str])
        .output();

    #[cfg(not(target_os = "windows"))]
    let result = Command::new(&ffmpeg_path)
        .args(["-i", &input_path, "-codec", "copy", "-y", &output_str])
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                Ok(output_str)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("ffmpeg failed: {}", stderr))
            }
        }
        Err(e) => Err(format!("Failed to run ffmpeg: {}", e)),
    }
}

/// Install ffmpeg automatically
#[tauri::command]
async fn install_ffmpeg() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Check if Homebrew is available
        let brew_paths = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
        let mut brew_path: Option<&str> = None;
        
        for path in brew_paths {
            if PathBuf::from(path).exists() {
                brew_path = Some(path);
                break;
            }
        }

        if let Some(brew) = brew_path {
            let result = Command::new(brew)
                .args(["install", "ffmpeg"])
                .output()
                .map_err(|e| format!("Failed to run brew: {}", e))?;

            if result.status.success() {
                return Ok(());
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                return Err(format!("Homebrew install failed: {}", stderr));
            }
        }

        // Homebrew not available, download static binary
        download_ffmpeg_binary().await
    }

    #[cfg(target_os = "windows")]
    {
        // Check if winget is available
        let winget_check = Command::new("cmd")
            .args(["/C", "winget", "--version"])
            .output();

        if let Ok(output) = winget_check {
            if output.status.success() {
                let result = Command::new("cmd")
                    .args(["/C", "winget", "install", "Gyan.FFmpeg", "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
                    .output()
                    .map_err(|e| format!("Failed to run winget: {}", e))?;

                if result.status.success() {
                    return Ok(());
                }
            }
        }

        // winget not available, download static binary
        download_ffmpeg_binary().await
    }

    #[cfg(target_os = "linux")]
    {
        // Try apt-get first (Debian/Ubuntu)
        let apt_result = Command::new("pkexec")
            .args(["apt-get", "install", "-y", "ffmpeg"])
            .output();

        if let Ok(output) = apt_result {
            if output.status.success() {
                return Ok(());
            }
        }

        Err("Could not install ffmpeg automatically. Please install it manually using your package manager.".to_string())
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn download_ffmpeg_binary() -> Result<(), String> {
    use std::fs;
    use std::io::Write;

    // Get the app data directory for storing the binary
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    
    #[cfg(target_os = "macos")]
    let ffmpeg_dir = home.join(".local").join("bin");
    
    #[cfg(target_os = "windows")]
    let ffmpeg_dir = home.join("AppData").join("Local").join("ffmpeg");

    // Create directory if it doesn't exist
    fs::create_dir_all(&ffmpeg_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    #[cfg(target_os = "macos")]
    let download_url = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip";
    
    #[cfg(target_os = "windows")]
    let download_url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

    // Download the file
    let response = reqwest::get(download_url)
        .await
        .map_err(|e| format!("Failed to download ffmpeg: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let bytes = response.bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    // Save to temp file
    let temp_zip = ffmpeg_dir.join("ffmpeg_temp.zip");
    let mut file = fs::File::create(&temp_zip)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Extract the zip
    let file = fs::File::open(&temp_zip)
        .map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        
        let name = file.name().to_string();
        
        // Look for ffmpeg binary
        #[cfg(target_os = "macos")]
        let is_ffmpeg = name == "ffmpeg" || name.ends_with("/ffmpeg");
        
        #[cfg(target_os = "windows")]
        let is_ffmpeg = name.ends_with("ffmpeg.exe");

        if is_ffmpeg {
            #[cfg(target_os = "macos")]
            let dest_path = ffmpeg_dir.join("ffmpeg");
            
            #[cfg(target_os = "windows")]
            let dest_path = ffmpeg_dir.join("ffmpeg.exe");

            let mut dest_file = fs::File::create(&dest_path)
                .map_err(|e| format!("Failed to create ffmpeg binary: {}", e))?;
            std::io::copy(&mut file, &mut dest_file)
                .map_err(|e| format!("Failed to extract ffmpeg: {}", e))?;

            // Make executable on macOS
            #[cfg(target_os = "macos")]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(&dest_path)
                    .map_err(|e| format!("Failed to get permissions: {}", e))?
                    .permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&dest_path, perms)
                    .map_err(|e| format!("Failed to set permissions: {}", e))?;
            }

            break;
        }
    }

    // Clean up temp file
    let _ = fs::remove_file(temp_zip);

    Ok(())
}

/// Reveal a file in the system file explorer (Finder on macOS, Explorer on Windows)
#[tauri::command]
fn reveal_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try xdg-open on the parent directory
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        
        Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![check_ffmpeg, convert_file, install_ffmpeg, reveal_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
