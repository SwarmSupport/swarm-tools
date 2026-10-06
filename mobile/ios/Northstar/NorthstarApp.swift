import SwiftUI
import STCore

@MainActor
final class LocalProxy: ObservableObject {
    @Published var status = "The mobile packet engine is unavailable. VPN activation is unavailable."
    private var core: MobilecoreCore?

    func start() {
        guard core == nil, let next = MobilecoreNewCore() else { return }
        do {
            try next.start(0, socksPort: 0)
            core = next
            status = "HTTP: \(next.httpAddress())  SOCKS5: \(next.sockS5Address())"
        } catch {
            status = error.localizedDescription
        }
    }

    func stop() {
        try? core?.stop()
        core = nil
        status = "Local proxies stopped. VPN activation is unavailable."
    }
}

@main
struct NorthstarApp: App {
    @StateObject private var proxy = LocalProxy()
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Text("Swarm Tools").font(.title)
                Text(proxy.status)
                    .multilineTextAlignment(.center)
                Button("Start local proxies") { proxy.start() }
                Button("Stop local proxies") { proxy.stop() }
            }
            .padding()
        }
    }
}
