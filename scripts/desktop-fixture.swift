// Disposable LAB desktop fixture: one app LAB starts, owns and stops by pid.
// Arguments: title, saved-value file, trigger file, pid file.
// - The window title comes from argv[1] so a run can prove it bound its own window.
// - Save writes the Name field to argv[2]: an independent check of what arrived.
// - When argv[3] appears, the fixture opens a second window of its OWN and makes
//   it key, so focus leaves the bound window without touching any other app.
// - At launch it writes its pid to argv[4] and activates itself.
import AppKit

final class Fixture: NSObject, NSApplicationDelegate {
  let args = CommandLine.arguments
  let window = NSWindow(contentRect: NSRect(x: 200, y: 200, width: 420, height: 220), styleMask: [.titled, .closable], backing: .buffered, defer: false)
  let other = NSWindow(contentRect: NSRect(x: 660, y: 200, width: 300, height: 120), styleMask: [.titled, .closable], backing: .buffered, defer: false)
  let name = NSTextField(frame: NSRect(x: 20, y: 160, width: 380, height: 24))
  let secret = NSSecureTextField(frame: NSRect(x: 20, y: 124, width: 380, height: 24))
  let saved = NSTextField(labelWithString: "Saved: (nothing)")
  var timer: Timer?
  func arg(_ i: Int) -> String? { args.count > i ? args[i] : nil }
  func applicationDidFinishLaunching(_ note: Notification) {
    window.title = arg(1) ?? "LAB desktop fixture"
    window.isReleasedWhenClosed = false; other.isReleasedWhenClosed = false
    name.placeholderString = "Name"; name.setAccessibilityLabel("Name")
    secret.placeholderString = "Password"; secret.setAccessibilityLabel("Password")
    let save = NSButton(title: "Save", target: self, action: #selector(save))
    save.frame = NSRect(x: 20, y: 80, width: 100, height: 30)
    saved.frame = NSRect(x: 20, y: 40, width: 380, height: 24); saved.setAccessibilityLabel("Result")
    for view in [name, secret, save, saved] as [NSView] { window.contentView?.addSubview(view) }
    if let pidFile = arg(4) { try? String(getpid()).write(toFile: pidFile, atomically: true, encoding: .utf8) }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate()
    if let trigger = arg(3) {
      timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] t in
        guard let self, FileManager.default.fileExists(atPath: trigger) else { return }
        t.invalidate()
        self.other.title = (self.arg(1) ?? "LAB desktop fixture") + " (other)"
        self.other.makeKeyAndOrderFront(nil)
      }
    }
  }
  @objc func save() {
    saved.stringValue = "Saved: " + name.stringValue
    if let file = arg(2) { try? name.stringValue.write(toFile: file, atomically: true, encoding: .utf8) }
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}
let app = NSApplication.shared
let delegate = Fixture()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
