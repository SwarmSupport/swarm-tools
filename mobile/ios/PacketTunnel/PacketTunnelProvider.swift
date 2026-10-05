import Foundation
import NetworkExtension

/// The system calls this extension after VPN permission is granted. Fail before
/// installing a default route until a packet engine can forward traffic.
final class PacketTunnelProvider: NEPacketTunnelProvider {
    private var engine: PacketEngine?

    override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        guard let engine = PacketEngineFactory.make(), engine.isReady else {
            completionHandler(NSError(domain: "Northstar", code: 1,
                                      userInfo: [NSLocalizedDescriptionKey: "st-core packet engine is unavailable"]))
            return
        }
        self.engine = engine
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "10.111.0.1")
        let ipv4 = NEIPv4Settings(addresses: ["10.111.0.2"], subnetMasks: ["255.255.255.255"])
        ipv4.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4
        settings.dnsSettings = NEDNSSettings(servers: ["10.111.0.1"])
        settings.mtu = 1500
        setTunnelNetworkSettings(settings) { [weak self] error in
            if let error { completionHandler(error); return }
            guard let self else { completionHandler(NSError(domain: "Northstar", code: 2)); return }
            do {
                try engine.start(packetFlow: self.packetFlow)
                completionHandler(nil)
            } catch {
                self.setTunnelNetworkSettings(nil) { _ in completionHandler(error) }
            }
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        engine?.stop()
        setTunnelNetworkSettings(nil) { _ in completionHandler() }
    }
}

enum PacketEngineFactory {
    static func make() -> PacketEngine? { nil }
}

/// Implement with a userspace IP stack that applies st-core routing and DNS.
protocol PacketEngine {
    var isReady: Bool { get }
    func start(packetFlow: NEPacketTunnelFlow) throws
    func stop()
}
