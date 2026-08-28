use std::sync::mpsc::{self, Sender};
use std::time::Duration;

use futures_util::StreamExt;
use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MidiInputPort {
    index: usize,
    name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MidiMessage {
    message_type: &'static str,
    channel: Option<u8>,
    note: Option<u8>,
    velocity: Option<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MidiStatus {
    state: &'static str,
    message: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RadioStation {
    #[serde(default)]
    stationuuid: String,
    #[serde(default)]
    name: String,
    #[serde(default, rename(deserialize = "url_resolved", serialize = "urlResolved"))]
    url_resolved: String,
    #[serde(default)]
    country: String,
    #[serde(default)]
    codec: String,
    #[serde(default)]
    bitrate: u32,
    #[serde(default)]
    tags: String,
    #[serde(default)]
    homepage: String,
    #[serde(default)]
    hls: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RadioCapture {
    data: Vec<u8>,
    content_type: String,
}

enum MidiCommand {
    Connect(usize),
    Disconnect,
}

struct MidiManager {
    sender: Sender<MidiCommand>,
}

impl MidiManager {
    fn new(app: AppHandle) -> Self {
        let (sender, receiver) = mpsc::channel::<MidiCommand>();
        std::thread::spawn(move || {
            // The connection stays on this dedicated thread. This keeps the OS MIDI
            // callback off the UI/audio threads and makes reconnecting deterministic.
            let mut connection: Option<MidiInputConnection<()>> = None;
            while let Ok(command) = receiver.recv() {
                match command {
                    MidiCommand::Disconnect => {
                        connection.take();
                        let _ = app.emit("midi-status", MidiStatus {
                            state: "disconnected",
                            message: "MIDI input disconnected".into(),
                        });
                    }
                    MidiCommand::Connect(index) => {
                        connection.take();
                        let mut input = match MidiInput::new("Hi Drone MIDI input") {
                            Ok(input) => input,
                            Err(error) => {
                                let _ = app.emit("midi-status", MidiStatus { state: "error", message: error.to_string() });
                                continue;
                            }
                        };
                        input.ignore(Ignore::None);
                        let ports = input.ports();
                        let Some(port) = ports.get(index) else {
                            let _ = app.emit("midi-status", MidiStatus { state: "error", message: "MIDI port is no longer available".into() });
                            continue;
                        };
                        let port_name = input.port_name(port).unwrap_or_else(|_| "Unnamed MIDI input".into());
                        let callback_app = app.clone();
                        match input.connect(port, "Hi Drone MIDI listener", move |_, bytes, _| {
                            let event = match bytes {
                                [status, note, velocity, ..] if status & 0xf0 == 0x90 && *velocity > 0 => MidiMessage { message_type: "noteOn", channel: Some(status & 0x0f), note: Some(*note), velocity: Some(*velocity) },
                                [status, note, velocity, ..] if status & 0xf0 == 0x80 || (status & 0xf0 == 0x90 && *velocity == 0) => MidiMessage { message_type: "noteOff", channel: Some(status & 0x0f), note: Some(*note), velocity: Some(*velocity) },
                                [0xf8, ..] => MidiMessage { message_type: "clock", channel: None, note: None, velocity: None },
                                [0xfa, ..] => MidiMessage { message_type: "start", channel: None, note: None, velocity: None },
                                [0xfb, ..] => MidiMessage { message_type: "continue", channel: None, note: None, velocity: None },
                                [0xfc, ..] => MidiMessage { message_type: "stop", channel: None, note: None, velocity: None },
                                _ => return,
                            };
                            let _ = callback_app.emit("midi-message", event);
                        }, ()) {
                            Ok(new_connection) => {
                                connection = Some(new_connection);
                                let _ = app.emit("midi-status", MidiStatus { state: "connected", message: format!("Listening to {port_name}") });
                            }
                            Err(error) => {
                                let _ = app.emit("midi-status", MidiStatus { state: "error", message: error.to_string() });
                            }
                        }
                    }
                }
            }
        });
        Self { sender }
    }
}

#[tauri::command]
fn list_midi_inputs() -> Result<Vec<MidiInputPort>, String> {
    let input = MidiInput::new("Hi Drone MIDI port scan").map_err(|error| error.to_string())?;
    input.ports().iter().enumerate().map(|(index, port)| {
        input.port_name(port)
            .map(|name| MidiInputPort { index, name })
            .map_err(|error| error.to_string())
    }).collect()
}

#[tauri::command]
fn connect_midi_input(input_index: usize, midi: State<'_, MidiManager>) -> Result<(), String> {
    midi.sender.send(MidiCommand::Connect(input_index)).map_err(|error| error.to_string())
}

#[tauri::command]
fn disconnect_midi_input(midi: State<'_, MidiManager>) -> Result<(), String> {
    midi.sender.send(MidiCommand::Disconnect).map_err(|error| error.to_string())
}

#[tauri::command]
async fn search_radio_stations(query: String) -> Result<Vec<RadioStation>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Hi Drone/0.1.0 (radio sampler)")
        .build()
        .map_err(|error| error.to_string())?;
    let query = query.trim();
    let mut stations = Vec::new();
    let searches = if query.is_empty() {
        vec![("https://de2.api.radio-browser.info/json/stations/topclick/24", None)]
    } else {
        vec![
            ("https://de2.api.radio-browser.info/json/stations/search", Some(("name", query))),
            ("https://de2.api.radio-browser.info/json/stations/search", Some(("tag", query))),
        ]
    };

    for (endpoint, search) in searches {
        let mut request = client.get(endpoint).query(&[
            ("hidebroken", "true"),
            ("order", "clickcount"),
            ("reverse", "true"),
            ("limit", "24"),
        ]);
        if let Some((field, value)) = search { request = request.query(&[(field, value)]); }
        let mut response = request.send().await
            .map_err(|error| format!("Radio directory unavailable: {error}"))?
            .error_for_status()
            .map_err(|error| format!("Radio directory returned an error: {error}"))?
            .json::<Vec<RadioStation>>().await
            .map_err(|error| format!("Couldn't read radio directory results: {error}"))?;
        stations.append(&mut response);
    }

    let mut seen = std::collections::HashSet::new();
    stations.retain(|station| {
        !station.name.is_empty()
            && station.url_resolved.starts_with("https://")
            && station.hls == 0
            && seen.insert(station.stationuuid.clone())
    });
    stations.truncate(18);
    Ok(stations)
}

#[tauri::command]
async fn capture_radio_stream(url: String, seconds: u64) -> Result<RadioCapture, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Enter a valid direct radio stream URL".to_string())?;
    if parsed.scheme() != "https" { return Err("Radio capture requires a direct HTTPS stream".into()); }
    let seconds = seconds.clamp(4, 30);
    let client = reqwest::Client::builder()
        .user_agent("Hi Drone/0.1.0 (radio sampler)")
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client.get(parsed)
        .header("Accept", "audio/mpeg, audio/aac, audio/aacp, audio/ogg;q=0.8, */*;q=0.2")
        .send().await
        .map_err(|error| format!("Couldn't connect to radio stream: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Radio stream returned an error: {error}"))?;
    let content_type = response.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("audio/mpeg")
        .split(';').next().unwrap_or("audio/mpeg").to_string();
    let mut stream = response.bytes_stream();
    let started = tokio::time::Instant::now();
    let duration = Duration::from_secs(seconds);
    let mut data = Vec::new();

    while started.elapsed() < duration && data.len() < 12 * 1024 * 1024 {
        let remaining = duration.saturating_sub(started.elapsed());
        let wait = remaining.min(Duration::from_secs(4));
        match tokio::time::timeout(wait, stream.next()).await {
            Ok(Some(Ok(chunk))) => data.extend_from_slice(&chunk),
            Ok(Some(Err(error))) => return Err(format!("Radio stream stopped during capture: {error}")),
            Ok(None) => break,
            Err(_) if !data.is_empty() => break,
            Err(_) => return Err("Radio stream did not send audio in time".into()),
        }
    }
    if data.len() < 4096 { return Err("Radio stream returned too little audio to sample".into()); }
    Ok(RadioCapture { data, content_type })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(MidiManager::new(app.handle().clone()));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_midi_inputs, connect_midi_input, disconnect_midi_input, search_radio_stations, capture_radio_stream])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
