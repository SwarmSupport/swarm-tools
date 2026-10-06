package com.northstar.mobile

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import mobilecore.Mobilecore
import mobilecore.Core

class MainActivity : Activity() {
    private lateinit var status: TextView
    private var proxy: Core? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status = TextView(this)
        status.text = if (PacketEngineRegistry.isAvailable) "Ready to request VPN access" else
            "The mobile packet engine is unavailable. VPN activation is unavailable."
        val connect = Button(this).apply {
            text = "Connect VPN"
            isEnabled = PacketEngineRegistry.isAvailable
            setOnClickListener { requestVpnPermission() }
        }
        val startProxy = Button(this).apply {
            text = "Start local proxies"
            setOnClickListener {
                try {
                    val core = Mobilecore.newCore()
                    core.start(0, 0)
                    proxy = core
                    status.text = "HTTP: ${core.httpAddress()}  SOCKS5: ${core.sockS5Address()}"
                    isEnabled = false
                } catch (error: Exception) {
                    status.text = error.message ?: "Unable to start local proxies"
                }
            }
        }
        val stopProxy = Button(this).apply {
            text = "Stop local proxies"
            setOnClickListener {
                runCatching { proxy?.stop() }
                proxy = null
                startProxy.isEnabled = true
                status.text = "Local proxies stopped. VPN activation is unavailable."
            }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            addView(status)
            addView(connect)
            addView(startProxy)
            addView(stopProxy)
        })
    }

    override fun onDestroy() {
        runCatching { proxy?.stop() }
        proxy = null
        super.onDestroy()
    }

    private fun requestVpnPermission() {
        val consent = VpnService.prepare(this)
        if (consent != null) startActivityForResult(consent, VPN_REQUEST)
        else startService(Intent(this, NorthstarVpnService::class.java))
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == VPN_REQUEST && resultCode == RESULT_OK)
            startService(Intent(this, NorthstarVpnService::class.java))
    }

    companion object { private const val VPN_REQUEST = 1 }
}
