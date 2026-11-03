// Disposable LAB desktop fixture: one window LAB starts, owns and stops by pid.
// Window title comes from argv[1] so a run can prove it bound its own window.
import AppKit

final class Fixture: NSObject, NSApplicationDelegate {
  let window = NSWindow(contentRect: NSRect(x: 200, y: 200, width: 420, height: 220), styleMask: [.titled, .closable], backing: .buffered, defer: false)
  let name = NSTextField(frame: NSRect(x: 20, y: 160, width: 380, height: 24))
  let secret = NSSecureTextField(frame: NSRect(x: 20, y: 124, width: 380, height: 24))
  let saved = NSTextField(labelWithString: "Saved: (nothing)")
  func applicationDidFinishLaunching(_ note: Notification) {
    window.title = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "LAB desktop fixture"
    name.placeholderString = "Name"; name.setAccessibilityLabel("Name")
    secret.placeholderString = "Password"; secret.setAccessibilityLabel("Password")
    let save = NSButton(title: "Save", target: self, action: #selector(save))
    save.frame = NSRect(x: 20, y: 80, width: 100, height: 30)
    saved.frame = NSRect(x: 20, y: 40, width: 380, height: 24); saved.setAccessibilityLabel("Result")
    for view in [name, secret, save, saved] as [NSView] { window.contentView?.addSubview(view) }
    window.makeKeyAndOrderFront(nil)
  }
  @objc func save() {
    saved.stringValue = "Saved: " + name.stringValue
    // Independent check for the smoke: the fixture itself records what it received.
    if CommandLine.arguments.count > 2 { try? name.stringValue.write(toFile: CommandLine.arguments[2], atomically: true, encoding: .utf8) }
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}
let app = NSApplication.shared
let delegate = Fixture()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
