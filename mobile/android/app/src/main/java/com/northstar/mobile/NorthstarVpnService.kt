package com.northstar.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor

/** Android owns the TUN interface; a packet engine must be ready before establishing it. */
class NorthstarVpnService : VpnService() {
    private var tun: ParcelFileDescriptor? = null
    private var engine: PacketEngine? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nextEngine = PacketEngineRegistry.create()
        if (nextEngine == null || !nextEngine.isReady) {
            stopSelf()
            return START_NOT_STICKY
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("vpn", "VPN status", NotificationManager.IMPORTANCE_LOW))
        startForeground(1, Notification.Builder(this, "vpn")
            .setContentTitle("Swarm Tools VPN")
            .setContentText("Routing device traffic")
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .build())
        try {
            startTunnel(nextEngine)
            engine = nextEngine
        } catch (_: Throwable) {
            nextEngine.stop()
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun startTunnel(engine: PacketEngine) {
        check(engine.isReady) { "Cannot route traffic: st-core packet engine is unavailable" }
        val descriptor = Builder()
            .setSession("Swarm Tools")
            .setMtu(1500)
            .addAddress("10.111.0.2", 32)
            .addRoute("0.0.0.0", 0)
            .addDnsServer("10.111.0.1")
            .establish() ?: error("VPN permission was revoked")
        try {
            engine.start(descriptor) { fd -> protect(fd) }
            tun = descriptor
        } catch (error: Throwable) {
            descriptor.close()
            throw error
        }
    }

    override fun onRevoke() {
        closeTunnel()
        super.onRevoke()
    }

    override fun onDestroy() {
        closeTunnel()
        super.onDestroy()
    }

    private fun closeTunnel() {
        engine?.stop()
        engine = null
        tun?.close()
        tun = null
    }
}

/** The implementation must forward TCP, UDP and DNS into st-core and inject replies into TUN. */
interface PacketEngine {
    val isReady: Boolean
    fun start(tun: ParcelFileDescriptor, protectSocket: (Int) -> Boolean)
    fun stop()
}

/** A mobile st-core binding registers its packet engine here before Connect is enabled. */
object PacketEngineRegistry {
    var factory: (() -> PacketEngine)? = null
    val isAvailable: Boolean get() = factory != null
    fun create(): PacketEngine? = factory?.invoke()
}
