// Her derlemede (debug dahil) konsol penceresi açılmaz
#![windows_subsystem = "windows"]

use chrono::{DateTime, Local, NaiveDateTime, TimeZone};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

#[allow(dead_code)]
const APP_ID: &str = "com.smartnotes.app";

const TOAST_AUMID: &str = "BDNotes.App";
const TOAST_DISPLAY_NAME: &str = "BD Notlar";
const NOTE_URL_PREFIX: &str = "smartnotes://note/";

static HIDE_MAIN_ON_START: AtomicBool = AtomicBool::new(false);

fn note_id_from_args(args: &[String]) -> Option<String> {
    for a in args.iter().skip(1) {
        if let Some(rest) = a.trim_matches('"').strip_prefix(NOTE_URL_PREFIX) {
            let id = rest.trim_matches('/').to_string();
            if !id.is_empty() {
                return Some(id);
            }
        }
    }
    None
}

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body_json: String,
    pub body_text: String,
    pub created_at: String,
    pub updated_at: String,
    pub start_at: Option<String>,
    pub due_at: Option<String>,
    pub reminder_at: Option<String>,
    pub reminder_note: Option<String>,
    pub category_id: Option<String>,
    pub status_id: String,
    pub priority: i64,
    pub color: Option<String>,
    pub is_pinned: bool,
    pub is_favorite: bool,
    pub is_completed: bool,
    pub manual_order: f64,
    pub custom_fields: serde_json::Value,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Subtask {
    pub id: String,
    pub note_id: String,
    pub text: String,
    pub is_done: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: String,
    pub note_id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Attachment {
    pub id: String,
    pub note_id: String,
    pub original_name: String,
    pub stored_path: String,
}

fn get_current_iso() -> String {
    let now = std::time::SystemTime::now();
    let duration = now.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();

    let days = (secs / 86400) as i64;
    let day_secs = (secs % 86400) as i64;
    let hours = day_secs / 3600;
    let minutes = (day_secs % 3600) / 60;
    let seconds = day_secs % 60;

    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z", y, m, d, hours, minutes, seconds)
}

// --- WINDOWS GÖREV ZAMANLAYICI FİLTRESİ ---
const ACTIVE_FILTER: &str = "deleted_at IS NULL";

fn app_data_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| {
        let mut p = PathBuf::from(a);
        p.push("smart-notes");
        p
    })
}

fn log_line(msg: &str) {
    let Some(mut p) = app_data_dir() else { return };
    let _ = fs::create_dir_all(&p);
    p.push("notifications.log");
    if let Ok(meta) = fs::metadata(&p) {
        if meta.len() > 200_000 {
            let _ = fs::remove_file(&p);
        }
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&p) {
        let _ = writeln!(f, "[{}] {}", Local::now().format("%Y-%m-%d %H:%M:%S"), msg);
    }
}

#[cfg(windows)]
extern "system" {
    fn FreeConsole() -> i32;
}

fn hide_console() {
    #[cfg(windows)]
    unsafe {
        FreeConsole();
    }
}

fn clean_name(name: &str) -> String {
    name.replace(|c: char| !c.is_alphanumeric() && c != '_', "")
}

fn task_name(task_id: &str) -> String {
    clean_name(&format!("SmartNotes_{}", task_id.replace('-', "_")))
}

fn run_schtasks(args: &[&str]) -> bool {
    let mut cmd = std::process::Command::new("schtasks");
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    match cmd.output() {
        Ok(out) => {
            if !out.status.success() && args.first() != Some(&"/Delete") {
                log_line(&format!(
                    "schtasks {:?} BAŞARISIZ: {} {}",
                    args,
                    String::from_utf8_lossy(&out.stdout).trim(),
                    String::from_utf8_lossy(&out.stderr).trim()
                ));
            }
            out.status.success()
        }
        Err(e) => {
            log_line(&format!("schtasks çalıştırılamadı: {}", e));
            false
        }
    }
}

#[cfg(windows)]
fn reg_add(key: &str, name: Option<&str>, value: &str) {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new("reg");
    cmd.arg("add").arg(key);
    match name {
        Some(n) => {
            cmd.args(["/v", n]);
        }
        None => {
            cmd.arg("/ve");
        }
    }
    cmd.args(["/t", "REG_SZ", "/d", value, "/f"]);
    cmd.creation_flags(0x08000000);
    match cmd.output() {
        Ok(o) if !o.status.success() => log_line(&format!(
            "reg add BAŞARISIZ ({}): {}",
            key,
            String::from_utf8_lossy(&o.stderr).trim()
        )),
        Err(e) => log_line(&format!("reg çalıştırılamadı: {}", e)),
        _ => {}
    }
}

fn register_app_id() {
    #[cfg(windows)]
    {
        let aumid = format!("HKCU\\Software\\Classes\\AppUserModelId\\{}", TOAST_AUMID);
        reg_add(&aumid, Some("DisplayName"), TOAST_DISPLAY_NAME);

        if !cfg!(debug_assertions) {
          if let Ok(exe) = std::env::current_exe() {
            let proto = "HKCU\\Software\\Classes\\smartnotes";
            reg_add(proto, None, "URL:BD Notlar");
            reg_add(proto, Some("URL Protocol"), "");
            let cmd_key = format!("{}\\shell\\open\\command", proto);
            reg_add(&cmd_key, None, &format!("\"{}\" \"%1\"", exe.display()));
          }
        }
    }
}

fn show_note_toast(title: &str, body: &str, note_id: &str) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let xml = format!(
            "<toast activationType=\"protocol\" launch=\"{}{}\" duration=\"short\">\
             <visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual>\
             </toast>",
            NOTE_URL_PREFIX,
            xml_escape(note_id),
            xml_escape(title),
            xml_escape(body)
        );
        let script = "[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]; \
                      [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]; \
                      $x = New-Object Windows.Data.Xml.Dom.XmlDocument; \
                      $x.LoadXml($env:SN_TOAST_XML); \
                      $t = [Windows.UI.Notifications.ToastNotification]::new($x); \
                      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:SN_APP_ID).Show($t)";
        let mut cmd = std::process::Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ]);
        cmd.env("SN_TOAST_XML", xml).env("SN_APP_ID", TOAST_AUMID);
        cmd.creation_flags(0x08000000);
        match cmd.output() {
            Ok(o) if o.status.success() => {
                log_line(&format!("Tıklanabilir toast gösterildi: {}{}", NOTE_URL_PREFIX, note_id));
                return true;
            }
            Ok(o) => {
                log_line(&format!(
                    "PowerShell toast başarısız: {}",
                    String::from_utf8_lossy(&o.stderr).trim()
                ));
            }
            Err(e) => {
                log_line(&format!("PowerShell çalıştırılamadı: {}", e));
            }
        }
    }
    let _ = (title, body, note_id);
    false
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn parse_to_local(iso: &str) -> Option<DateTime<Local>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(iso) {
        return Some(dt.with_timezone(&Local));
    }
    for fmt in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"] {
        if let Ok(n) = NaiveDateTime::parse_from_str(iso, fmt) {
            return Local.from_local_datetime(&n).single();
        }
    }
    None
}

fn schedule_windows_task(task_id: &str, iso_time: &str) {
    let Some(local) = parse_to_local(iso_time) else {
        log_line(&format!("Geçersiz hatırlatıcı zamanı ({}): {}", task_id, iso_time));
        return;
    };
    if local <= Local::now() {
        return;
    }
    let name = task_name(task_id);
    let exe = std::env::current_exe().unwrap_or_default();
    let start = local.format("%Y-%m-%dT%H:%M:%S").to_string();

    let xml = format!(
r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <TimeTrigger>
      <StartBoundary>{start}</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT1M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{exe}</Command>
      <Arguments>--notification-trigger "{id}"</Arguments>
    </Exec>
  </Actions>
</Task>"#,
        start = start,
        exe = xml_escape(&exe.display().to_string()),
        id = xml_escape(task_id),
    );

    let mut bytes: Vec<u8> = vec![0xFF, 0xFE];
    for u in xml.encode_utf16() {
        bytes.extend_from_slice(&u.to_le_bytes());
    }
    let mut xml_path = std::env::temp_dir();
    xml_path.push(format!("{}.xml", name));
    if let Err(e) = fs::write(&xml_path, bytes) {
        log_line(&format!("Görev XML'i yazılamadı: {}", e));
        return;
    }
    run_schtasks(&["/Delete", "/TN", &name, "/F"]);
    let ok = run_schtasks(&["/Create", "/TN", &name, "/XML", &xml_path.to_string_lossy(), "/F"]);
    let _ = fs::remove_file(&xml_path);
    if ok {
        log_line(&format!("Görev kuruldu: {} -> {}", name, start));
    }
}

fn remove_windows_task(task_id: &str) {
    run_schtasks(&["/Delete", "/TN", &task_name(task_id), "/F"]);
}

fn resync_task(conn: &Connection, id: &str) {
    let sql = format!(
        "SELECT reminder_at FROM notes WHERE id = ?1 AND {}",
        ACTIVE_FILTER
    );
    let row: Result<Option<String>, rusqlite::Error> =
        conn.query_row(&sql, params![id], |r| r.get::<_, Option<String>>(0));
    match row {
        Ok(Some(iso)) => schedule_windows_task(id, &iso),
        _ => remove_windows_task(id),
    }
}

fn sync_all_reminder_tasks(conn: &Connection) {
    let sql = format!(
        "SELECT id, reminder_at FROM notes WHERE reminder_at IS NOT NULL AND {}",
        ACTIVE_FILTER
    );
    let Ok(mut stmt) = conn.prepare(&sql) else { return };
    let rows: Vec<(String, String)> = match stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    }) {
        Ok(it) => it.filter_map(|x| x.ok()).collect(),
        Err(_) => return,
    };
    for (id, iso) in rows {
        schedule_windows_task(&id, &iso);
    }
}

fn claim_reminder(conn: &Connection, id: &str) -> bool {
    conn.execute(
        "UPDATE notes SET reminder_at = NULL WHERE id = ?1 AND reminder_at IS NOT NULL",
        params![id],
    )
    .map(|n| n == 1)
    .unwrap_or(false)
}

fn unclaim_reminder(conn: &Connection, id: &str, original: &str) {
    let _ = conn.execute(
        "UPDATE notes SET reminder_at = ?1 WHERE id = ?2 AND reminder_at IS NULL",
        params![original, id],
    );
}

fn handle_notification_trigger(note_id: &str) {
    register_app_id();
    let Some(mut p) = app_data_dir() else { return };
    p.push("smart_notes.db");
    let conn = match Connection::open(&p) {
        Ok(c) => c,
        Err(e) => {
            log_line(&format!("Tetikleyici: veritabanı açılamadı: {}", e));
            return;
        }
    };
    let _ = conn.busy_timeout(Duration::from_secs(5));

    let sql = format!(
        "SELECT title, reminder_note, reminder_at FROM notes
         WHERE id = ?1 AND reminder_at IS NOT NULL AND {}",
        ACTIVE_FILTER
    );
    let res: Result<(String, Option<String>, String), rusqlite::Error> =
        conn.query_row(&sql, params![note_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
            ))
        });

    if let Ok((title, reminder_note, at)) = res {
        if let Some(t) = parse_to_local(&at) {
            if t > Local::now() + chrono::Duration::minutes(2) {
                schedule_windows_task(note_id, &at);
                return;
            }
        }

        if claim_reminder(&conn, note_id) {
            let body = reminder_note
                .unwrap_or_else(|| "Notunuzun hatırlatıcı vakti geldi.".to_string());
            let shown = if show_note_toast(&title, &body, note_id) {
                true
            } else {
                let r = notify_rust::Notification::new()
                    .summary(&title)
                    .body(&body)
                    .app_id(TOAST_AUMID)
                    .timeout(notify_rust::Timeout::Milliseconds(5000))
                    .show();
                match r {
                    Ok(_) => {
                        std::thread::sleep(Duration::from_secs(3));
                        true
                    }
                    Err(e) => {
                        log_line(&format!("Bildirim gösterilemedi: {}", e));
                        false
                    }
                }
            };
            if shown {
                log_line(&format!("Bildirim gösterildi (program kapalı): {}", title));
            } else {
                unclaim_reminder(&conn, note_id, &at);
            }
        }
    }
    remove_windows_task(note_id);
}

fn init_db(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body_json TEXT,
            body_text TEXT,
            created_at TEXT,
            updated_at TEXT,
            start_at TEXT,
            due_at TEXT,
            reminder_at TEXT,
            reminder_note TEXT,
            category_id TEXT,
            status_id TEXT DEFAULT 'todo',
            priority INTEGER DEFAULT 2,
            color TEXT,
            is_pinned INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            is_completed INTEGER DEFAULT 0,
            manual_order REAL DEFAULT 0.0,
            custom_fields TEXT DEFAULT '{}',
            archived_at TEXT,
            deleted_at TEXT
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            icon TEXT
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS subtasks (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            text TEXT NOT NULL,
            is_done INTEGER DEFAULT 0
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            name TEXT NOT NULL
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            original_name TEXT NOT NULL,
            stored_path TEXT NOT NULL
        );",
        [],
    )?;

    let cat_count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
    if cat_count == 0 {
        let defaults = [
            ("cat_work", "İş", "#3b82f6"),
            ("cat_personal", "Kişisel", "#10b981"),
            ("cat_ideas", "Fikirler", "#f59e0b"),
            ("cat_series", "Dizi", "#6366f1"),
        ];
        for (id, name, color) in defaults {
            conn.execute(
                "INSERT INTO categories (id, name, color, icon) VALUES (?1, ?2, ?3, 'Folder')",
                params![id, name, color],
            )?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn open_note_window(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let clean_id = id.replace("-", "_").replace(" ", "_");
    let label = format!("note_{}", clean_id);

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let url_str = format!("index.html?noteId={}", id);
    tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App(url_str.parse().unwrap())
    )
    .title("BD Notlar - Not Düzenleyici")
    .inner_size(760.0, 780.0)
    .min_inner_size(420.0, 400.0)
    .center()
    .resizable(true)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn editor_ready(window: tauri::Window) {
    if window.label() == "main" && HIDE_MAIN_ON_START.swap(false, Ordering::SeqCst) {
        return;
    }
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn query_notes(state: State<AppState>) -> Result<Vec<Note>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, body_json, body_text, created_at, updated_at, start_at, due_at, reminder_at, reminder_note, category_id, status_id, priority, color, is_pinned, is_favorite, is_completed, manual_order, custom_fields, archived_at, deleted_at FROM notes ORDER BY manual_order ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let custom_fields_str: String = row.get(18).unwrap_or_else(|_| "{}".to_string());
            let custom_fields: serde_json::Value =
                serde_json::from_str(&custom_fields_str).unwrap_or(serde_json::json!({}));

            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                body_json: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                body_text: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                start_at: row.get(6)?,
                due_at: row.get(7)?,
                reminder_at: row.get(8)?,
                reminder_note: row.get(9)?,
                category_id: row.get(10)?,
                status_id: row.get::<_, Option<String>>(11)?.unwrap_or_else(|| "todo".to_string()),
                priority: row.get(12)?,
                color: row.get(13)?,
                is_pinned: row.get::<_, i64>(14)? == 1,
                is_favorite: row.get::<_, i64>(15)? == 1,
                is_completed: row.get::<_, i64>(16)? == 1,
                manual_order: row.get(17)?,
                custom_fields,
                archived_at: row.get(19)?,
                deleted_at: row.get(20)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut notes = Vec::new();
    for note in rows {
        match note {
            Ok(n) => notes.push(n),
            Err(e) => log_line(&format!("query_notes: okunamayan satır atlandı: {}", e)),
        }
    }
    Ok(notes)
}

#[tauri::command]
fn create_note(
    title: String,
    category_id: Option<String>,
    start_at: Option<String>,
    state: State<AppState>,
) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = get_current_iso();
    let id = format!(
        "note_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let start = start_at.unwrap_or_else(|| now.clone());

    conn.execute(
        "INSERT INTO notes (id, title, body_json, body_text, created_at, updated_at, start_at, due_at, reminder_at, reminder_note, category_id, status_id, priority, color, is_pinned, is_favorite, is_completed, manual_order, custom_fields, archived_at, deleted_at)
         VALUES (?1, ?2, '', '', ?3, ?4, ?5, NULL, NULL, NULL, ?6, 'todo', 2, NULL, 0, 0, 0, 0.0, '{}', NULL, NULL)",
        params![id, title, now, now, start, category_id],
    ).map_err(|e| e.to_string())?;

    Ok(Note {
        id,
        title,
        body_json: String::new(),
        body_text: String::new(),
        created_at: now.clone(),
        updated_at: now.clone(),
        start_at: Some(start),
        due_at: None,
        reminder_at: None,
        reminder_note: None,
        category_id,
        status_id: "todo".to_string(),
        priority: 2,
        color: None,
        is_pinned: false,
        is_favorite: false,
        is_completed: false,
        manual_order: 0.0,
        custom_fields: serde_json::json!({}),
        archived_at: None,
        deleted_at: None,
    })
}

#[tauri::command]
fn update_note(
    id: String,
    title: String,
    body_json: String,
    body_text: String,
    state: State<AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = get_current_iso();
    conn.execute(
        "UPDATE notes SET title = ?1, body_json = ?2, body_text = ?3, updated_at = ?4 WHERE id = ?5",
        params![title, body_json, body_text, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_note_field(
    id: String,
    field: String,
    value: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = get_current_iso();

    match field.as_str() {
        "title" | "body_json" | "body_text" | "start_at" | "due_at" | "reminder_note"
        | "category_id" | "color" | "archived_at" | "deleted_at" => {
            let val_to_save = match value {
                Some(ref s) if s.trim().is_empty() => None,
                other => other,
            };
            let sql = format!("UPDATE notes SET {} = ?1, updated_at = ?2 WHERE id = ?3", field);
            conn.execute(&sql, params![val_to_save, now, id])
                .map_err(|e| e.to_string())?;
        }
        "status_id" => {
            conn.execute("UPDATE notes SET status_id = ?1, updated_at = ?2 WHERE id = ?3", params![value, now, id]).map_err(|e| e.to_string())?;
            
            if matches!(value.as_deref(), Some("done") | Some("completed")) {
                conn.execute(
                    "UPDATE notes SET is_completed = 1, due_at = COALESCE(due_at, ?1) WHERE id = ?2",
                    params![now, id],
                ).map_err(|e| e.to_string())?;
            }
        }
        "reminder_at" => {
            let val_to_save = match value {
                Some(ref s) if s.trim().is_empty() => None,
                other => other,
            };
            let sql = format!("UPDATE notes SET {} = ?1, updated_at = ?2 WHERE id = ?3", field);
            conn.execute(&sql, params![val_to_save, now, id])
                .map_err(|e| e.to_string())?;

            if let Some(ref time_val) = val_to_save {
                schedule_windows_task(&id, time_val);
            } else {
                remove_windows_task(&id);
            }
        }
        "priority" => {
            let val = value.and_then(|v| v.parse::<i64>().ok()).unwrap_or(2);
            conn.execute(
                "UPDATE notes SET priority = ?1, updated_at = ?2 WHERE id = ?3",
                params![val, now, id],
            )
            .map_err(|e| e.to_string())?;
        }
        "is_pinned" | "is_favorite" => {
            let val = if matches!(value.as_deref(), Some("true") | Some("1")) { 1 } else { 0 };
            let sql = format!("UPDATE notes SET {} = ?1, updated_at = ?2 WHERE id = ?3", field);
            conn.execute(&sql, params![val, now, id])
                .map_err(|e| e.to_string())?;
        }
        "is_completed" => {
            let val = if matches!(value.as_deref(), Some("true") | Some("1")) { 1 } else { 0 };
            
            if val == 1 {
                conn.execute(
                    "UPDATE notes SET is_completed = ?1, due_at = COALESCE(due_at, ?2), updated_at = ?3 WHERE id = ?4",
                    params![val, now, now, id],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE notes SET is_completed = ?1, due_at = NULL, updated_at = ?2 WHERE id = ?3",
                    params![val, now, id],
                ).map_err(|e| e.to_string())?;
            }
        }
        "manual_order" => {
            let val = value.and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
            conn.execute(
                "UPDATE notes SET manual_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![val, now, id],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => return Err("Geçersiz alan adı".to_string()),
    }

    if matches!(field.as_str(), "status_id" | "deleted_at" | "is_completed") {
        resync_task(&conn, &id);
    }

    Ok(())
}

#[tauri::command]
fn reorder_notes(ordered_ids: Vec<String>, state: State<AppState>) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (idx, id) in ordered_ids.iter().enumerate() {
        let order = (idx as f64) * 10.0;
        tx.execute(
            "UPDATE notes SET manual_order = ?1 WHERE id = ?2",
            params![order, id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn soft_delete_note(id: String, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = get_current_iso();
    conn.execute(
        "UPDATE notes SET deleted_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;
    remove_windows_task(&id);
    Ok(())
}

#[tauri::command]
fn restore_note(id: String, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notes SET deleted_at = NULL, archived_at = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    resync_task(&conn, &id);
    Ok(())
}

#[tauri::command]
fn permanent_delete_note(id: String, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM subtasks WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM attachments WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    remove_windows_task(&id);
    Ok(())
}

#[tauri::command]
fn empty_trash(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE deleted_at IS NOT NULL", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_categories(state: State<AppState>) -> Result<Vec<Category>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, color, icon FROM categories")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                icon: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut cats = Vec::new();
    for c in rows {
        if let Ok(item) = c {
            cats.push(item);
        }
    }
    Ok(cats)
}

#[tauri::command]
fn add_category(
    name: String,
    color: Option<String>,
    icon: Option<String>,
    state: State<AppState>,
) -> Result<Category, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = format!(
        "cat_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    conn.execute(
        "INSERT INTO categories (id, name, color, icon) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, color, icon],
    )
    .map_err(|e| e.to_string())?;

    Ok(Category {
        id,
        name,
        color,
        icon,
    })
}

#[tauri::command]
fn delete_category(id: String, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notes SET category_id = NULL WHERE category_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_subtasks(note_id: String, state: State<AppState>) -> Result<Vec<Subtask>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, note_id, text, is_done FROM subtasks WHERE note_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![note_id], |row| {
            Ok(Subtask {
                id: row.get(0)?,
                note_id: row.get(1)?,
                text: row.get(2)?,
                is_done: row.get::<_, i64>(3)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in rows {
        if let Ok(st) = item {
            list.push(st);
        }
    }
    Ok(list)
}

#[tauri::command]
fn add_subtask(
    note_id: String,
    text: String,
    state: State<AppState>,
) -> Result<Subtask, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = format!(
        "st_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    conn.execute(
        "INSERT INTO subtasks (id, note_id, text, is_done) VALUES (?1, ?2, ?3, 0)",
        params![id, note_id, text],
    )
    .map_err(|e| e.to_string())?;

    Ok(Subtask {
        id,
        note_id,
        text,
        is_done: false,
    })
}

#[tauri::command]
fn toggle_subtask(id: String, is_done: bool, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let val = if is_done { 1 } else { 0 };
    conn.execute(
        "UPDATE subtasks SET is_done = ?1 WHERE id = ?2",
        params![val, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_subtask(id: String, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM subtasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_tags(note_id: String, state: State<AppState>) -> Result<Vec<Tag>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, note_id, name FROM tags WHERE note_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![note_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                note_id: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in rows {
        if let Ok(t) = item {
            list.push(t);
        }
    }
    Ok(list)
}

#[tauri::command]
fn add_tag(note_id: String, name: String, state: State<AppState>) -> Result<Tag, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = format!(
        "tag_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    conn.execute(
        "INSERT INTO tags (id, note_id, name) VALUES (?1, ?2, ?3)",
        params![id, note_id, name],
    )
    .map_err(|e| e.to_string())?;

    Ok(Tag { id, note_id, name })
}

#[tauri::command]
fn remove_tag(note_id: String, tag_id: String, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM tags WHERE id = ?1 OR (note_id = ?2 AND id = ?1)",
        params![tag_id, note_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_attachments(
    note_id: String,
    state: State<AppState>,
) -> Result<Vec<Attachment>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, note_id, original_name, stored_path FROM attachments WHERE note_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![note_id], |row| {
            Ok(Attachment {
                id: row.get(0)?,
                note_id: row.get(1)?,
                original_name: row.get(2)?,
                stored_path: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in rows {
        if let Ok(a) = item {
            list.push(a);
        }
    }
    Ok(list)
}

#[tauri::command]
fn add_attachment(
    note_id: String,
    file_path: String,
    state: State<AppState>,
) -> Result<Attachment, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&file_path);
    let original_name = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "dosya".to_string());

    let id = format!(
        "att_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    conn.execute(
        "INSERT INTO attachments (id, note_id, original_name, stored_path) VALUES (?1, ?2, ?3, ?4)",
        params![id, note_id, original_name, file_path],
    )
    .map_err(|e| e.to_string())?;

    Ok(Attachment {
        id,
        note_id,
        original_name,
        stored_path: file_path,
    })
}

#[tauri::command]
fn download_attachment(source_path: String, target_path: String) -> Result<(), String> {
    fs::copy(&source_path, &target_path)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn export_csv(file_path: String, state: State<AppState>) -> Result<(), String> {
    let notes = query_notes(state)?;
    let file = File::create(&file_path).map_err(|e| e.to_string())?;
    
    let mut file_with_bom = std::io::BufWriter::new(file);
    file_with_bom.write_all(&[0xEF, 0xBB, 0xBF]).map_err(|e| e.to_string())?;
    
    let mut wtr = csv::Writer::from_writer(file_with_bom);
    wtr.write_record(&["ID", "Başlık", "İçerik", "Durum", "Öncelik", "Başlangıç", "Bitiş", "Oluşturulma"]).map_err(|e| e.to_string())?;
    
    for n in notes {
        wtr.write_record(&[
            &n.id,
            &n.title,
            &n.body_text,
            &n.status_id,
            &n.priority.to_string(),
            n.start_at.as_deref().unwrap_or(""),
            n.due_at.as_deref().unwrap_or(""),
            &n.created_at,
        ]).map_err(|e| e.to_string())?;
    }
    wtr.flush().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn export_json(file_path: String, state: State<AppState>) -> Result<(), String> {
    let notes = query_notes(state)?;
    let json = serde_json::to_string_pretty(&notes).map_err(|e| e.to_string())?;
    fs::write(&file_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_excel(file_path: String, state: State<AppState>) -> Result<(), String> {
    let notes = query_notes(state)?;
    let mut workbook = rust_xlsxwriter::Workbook::new();
    let sheet = workbook.add_worksheet();

    sheet.write_string(0, 0, "ID").map_err(|e| e.to_string())?;
    sheet.write_string(0, 1, "Başlık").map_err(|e| e.to_string())?;
    sheet.write_string(0, 2, "İçerik").map_err(|e| e.to_string())?;
    sheet.write_string(0, 3, "Durum").map_err(|e| e.to_string())?;
    sheet.write_string(0, 4, "Öncelik").map_err(|e| e.to_string())?;
    sheet.write_string(0, 5, "Başlangıç").map_err(|e| e.to_string())?;
    sheet.write_string(0, 6, "Bitiş").map_err(|e| e.to_string())?;
    sheet.write_string(0, 7, "Oluşturulma").map_err(|e| e.to_string())?;

    for (row, n) in notes.iter().enumerate() {
        let r = (row + 1) as u32;
        sheet.write_string(r, 0, &n.id).map_err(|e| e.to_string())?;
        sheet.write_string(r, 1, &n.title).map_err(|e| e.to_string())?;
        sheet.write_string(r, 2, &n.body_text).map_err(|e| e.to_string())?;
        sheet.write_string(r, 3, &n.status_id).map_err(|e| e.to_string())?;
        sheet.write_number(r, 4, n.priority as f64).map_err(|e| e.to_string())?;
        sheet.write_string(r, 5, n.start_at.as_deref().unwrap_or("")).map_err(|e| e.to_string())?;
        sheet.write_string(r, 6, n.due_at.as_deref().unwrap_or("")).map_err(|e| e.to_string())?;
        sheet.write_string(r, 7, &n.created_at).map_err(|e| e.to_string())?;
    }

    workbook.save(&file_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_json_backup(file_path: String, state: State<AppState>) -> Result<(), String> {
    let mut file = File::open(&file_path).map_err(|e| e.to_string())?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).map_err(|e| e.to_string())?;

    let notes: Vec<Note> = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for n in notes {
        let custom_fields_str = n.custom_fields.to_string();
        tx.execute(
            "INSERT OR REPLACE INTO notes (id, title, body_json, body_text, created_at, updated_at, start_at, due_at, reminder_at, reminder_note, category_id, status_id, priority, color, is_pinned, is_favorite, is_completed, manual_order, custom_fields, archived_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            params![
                n.id, n.title, n.body_json, n.body_text, n.created_at, n.updated_at,
                n.start_at, n.due_at, n.reminder_at, n.reminder_note, n.category_id,
                n.status_id, n.priority, n.color,
                if n.is_pinned { 1 } else { 0 },
                if n.is_favorite { 1 } else { 0 },
                if n.is_completed { 1 } else { 0 },
                n.manual_order, custom_fields_str, n.archived_at, n.deleted_at
            ],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    sync_all_reminder_tasks(&conn);
    Ok(())
}

#[derive(Debug, Deserialize)]
struct CsvNoteRecord {
    #[serde(alias = "ID", alias = "id")]
    id: Option<String>,
    #[serde(alias = "Başlık", alias = "title")]
    title: Option<String>,
    #[serde(alias = "İçerik", alias = "body_text", alias = "body")]
    body_text: Option<String>,
    #[serde(alias = "Durum", alias = "status_id", alias = "status")]
    status_id: Option<String>,
    #[serde(alias = "Öncelik", alias = "priority")]
    priority: Option<i64>,
    #[serde(alias = "Başlangıç", alias = "start_at")]
    start_at: Option<String>,
    #[serde(alias = "Bitiş", alias = "due_at")]
    due_at: Option<String>,
    #[serde(alias = "Oluşturulma", alias = "created_at")]
    created_at: Option<String>,
}

#[tauri::command]
fn import_csv_backup(file_path: String, state: State<AppState>) -> Result<(), String> {
    let file = File::open(&file_path).map_err(|e| e.to_string())?;
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(file);

    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = get_current_iso();

    for (idx, result) in rdr.deserialize::<CsvNoteRecord>().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(_) => continue,
        };

        let id = record.id.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| {
            format!("note_imp_{}_{}", idx, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis())
        });
        let title = record.title.unwrap_or_else(|| "İsimsiz Not".to_string());
        let body = record.body_text.unwrap_or_default();
        let status = record.status_id.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "todo".to_string());
        let priority = record.priority.unwrap_or(2);
        let start = record.start_at.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| now.clone());
        let due = record.due_at.filter(|s| !s.trim().is_empty());
        let created = record.created_at.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| now.clone());

        tx.execute(
            "INSERT INTO notes (id, title, body_json, body_text, created_at, updated_at, start_at, due_at, status_id, priority, manual_order)
             VALUES (?1, ?2, '', ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                body_json = excluded.body_json,
                body_text = excluded.body_text,
                updated_at = excluded.updated_at,
                start_at = excluded.start_at,
                due_at = excluded.due_at,
                status_id = excluded.status_id,
                priority = excluded.priority",
            params![id, title, body, created, start, due, status, priority, (idx as f64) * 10.0],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    sync_all_reminder_tasks(&conn);
    Ok(())
}

#[tauri::command]
fn close_this_window(window: tauri::Window) {
    let _ = window.close();
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 2 && args[1] == "--notification-trigger" {
        hide_console();
        handle_notification_trigger(&args[2]);
        return;
    }

    let db_path = if let Some(app_data) = std::env::var_os("APPDATA") {
        let mut p = PathBuf::from(app_data);
        p.push("smart-notes");
        let _ = fs::create_dir_all(&p);
        p.push("smart_notes.db");
        p
    } else {
        PathBuf::from("smart_notes.db")
    };

    let conn = Connection::open(&db_path).expect("Veritabanı açılamadı");
    init_db(&conn).expect("Veritabanı tabloları oluşturulamadı");

    register_app_id();
    {
        let sync_path = db_path.clone();
        std::thread::spawn(move || {
            if let Ok(c) = Connection::open(&sync_path) {
                let _ = c.busy_timeout(Duration::from_secs(5));
                sync_all_reminder_tasks(&c);
            }
        });
    }

    let db_state = AppState {
        db: Mutex::new(conn),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(id) = note_id_from_args(&args) {
                log_line(&format!("Tıklama mevcut uygulamaya yönlendirildi: {}", id));
                let h = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = open_note_window(h, id).await {
                        log_line(&format!("Not penceresi açılamadı: {}", e));
                    }
                });
            } else if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(db_state)
        .invoke_handler(tauri::generate_handler![
            open_note_window,
            editor_ready,
            query_notes,
            create_note,
            update_note,
            update_note_field,
            reorder_notes,
            soft_delete_note,
            restore_note,
            permanent_delete_note,
            empty_trash,
            get_categories,
            add_category,
            delete_category,
            get_subtasks,
            add_subtask,
            toggle_subtask,
            delete_subtask,
            get_tags,
            add_tag,
            remove_tag,
            get_attachments,
            add_attachment,
            download_attachment,
            export_csv,
            export_json,
            export_excel,
            import_json_backup,
            import_csv_backup,
            close_this_window,
        ])
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_resizable(false);
                let _ = window.set_maximizable(false);
            }

            let launch_args: Vec<String> = std::env::args().collect();
            if let Some(id) = note_id_from_args(&launch_args) {
                log_line(&format!("Uygulama bildirimden açıldı: {}", id));
                HIDE_MAIN_ON_START.store(true, Ordering::SeqCst);
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = open_note_window(h.clone(), id).await {
                        log_line(&format!("Not penceresi açılamadı: {}", e));
                        HIDE_MAIN_ON_START.store(false, Ordering::SeqCst);
                        if let Some(w) = h.get_webview_window("main") {
                            let _ = w.show();
                        }
                    }
                });
            }

            let app_handle_for_notifications = app.handle().clone();
            let db_path_clone = db_path.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));

                loop {
                    if let Ok(conn) = Connection::open(&db_path_clone) {
                        let _ = conn.busy_timeout(Duration::from_secs(5));

                        let sql = format!(
                            "SELECT id, title, reminder_note, reminder_at FROM notes
                             WHERE reminder_at IS NOT NULL AND {}",
                            ACTIVE_FILTER
                        );
                        let mut due: Vec<(String, String, Option<String>, String)> = Vec::new();
                        if let Ok(mut stmt) = conn.prepare(&sql) {
                            if let Ok(rows_iter) = stmt.query_map([], |row| {
                                Ok((
                                    row.get::<_, String>(0)?,
                                    row.get::<_, String>(1)?,
                                    row.get::<_, Option<String>>(2)?,
                                    row.get::<_, String>(3)?,
                                ))
                            }) {
                                for r in rows_iter {
                                    if let Ok(item) = r {
                                        due.push(item);
                                    }
                                }
                            }
                        }

                        let now = Local::now();
                        for (note_id, title, reminder_note, at) in due {
                            let is_due = match parse_to_local(&at) {
                                Some(t) => t <= now,
                                None => true,
                            };
                            if !is_due {
                                continue;
                            }
                            if !claim_reminder(&conn, &note_id) {
                                continue;
                            }
                            remove_windows_task(&note_id);

                            let body = reminder_note.unwrap_or_else(|| {
                                "Notunuzun hatırlatıcı vakti geldi.".to_string()
                            });
                            if !show_note_toast(&title, &body, &note_id) {
                                if let Err(e) = app_handle_for_notifications
                                    .notification()
                                    .builder()
                                    .title(&title)
                                    .body(&body)
                                    .show()
                                {
                                    log_line(&format!("Uygulama içi bildirim hatası: {}", e));
                                }
                            }
                        }
                    }
                    std::thread::sleep(Duration::from_secs(15));
                }
            });

            let show_i = MenuItem::with_id(app, "show", "BD Notlar'ı Göster", true, None::<&str>)?;
            let new_note_i = MenuItem::with_id(app, "new_note", "➕ Hızlı Yeni Not (Ctrl+Shift+N)", true, None::<&str>)?;
            let is_auto = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart_i = CheckMenuItem::with_id(app, "autostart", "Windows ile Başlat", true, is_auto, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &new_note_i, &autostart_i, &quit_i])?;

            let autostart_item = autostart_i.clone();

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "new_note" => {
                        let _ = app.emit("tray-new-note", ());
                    }
                    "autostart" => {
                        let manager = app.autolaunch();
                        let is_enabled = manager.is_enabled().unwrap_or(false);
                        if is_enabled {
                            let _ = manager.disable();
                        } else {
                            let _ = manager.enable();
                        }
                        let state_now = manager.is_enabled().unwrap_or(!is_enabled);
                        let _ = autostart_item.set_checked(state_now);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            let shortcut_n = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);
            let shortcut_s = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS);

            let shortcut_manager = app.global_shortcut();

            let _ = shortcut_manager.register(shortcut_n);
            let _ = shortcut_manager.register(shortcut_s);

            let app_handle = app.handle().clone();
            let _ = shortcut_manager.on_shortcut(shortcut_n, move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    let _ = app_handle.emit("tray-new-note", ());
                }
            });

            let app_handle_s = app.handle().clone();
            let _ = shortcut_manager.on_shortcut(shortcut_s, move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = app_handle_s.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması çalıştırılamadı");
}