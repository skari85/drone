use std::sync::mpsc::{self, Sender};

use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::Serialize;
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
        .invoke_handler(tauri::generate_handler![list_midi_inputs, connect_midi_input, disconnect_midi_input])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
