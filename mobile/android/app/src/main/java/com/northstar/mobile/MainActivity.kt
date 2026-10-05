package com.northstar.mobile

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status = TextView(this)
        status.text = if (PacketEngineRegistry.isAvailable) "Ready to request VPN access" else
            "The mobile packet engine has not been bundled. VPN activation is unavailable."
        val connect = Button(this).apply {
            text = "Connect VPN"
            isEnabled = PacketEngineRegistry.isAvailable
            setOnClickListener { requestVpnPermission() }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            addView(status)
            addView(connect)
        })
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
