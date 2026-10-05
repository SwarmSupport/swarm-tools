import SwiftUI

@main
struct NorthstarApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Text("Swarm Tools").font(.title)
                Text("The mobile packet engine has not been bundled. VPN activation is unavailable.")
                    .multilineTextAlignment(.center)
            }
            .padding()
        }
    }
}
