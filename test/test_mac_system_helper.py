"""Pure hosts-block checks; never writes to /etc/hosts."""

import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock

HELPER = pathlib.Path(__file__).resolve().parents[1] / "mac-system-helper.py"
spec = importlib.util.spec_from_file_location("mac_system_helper", HELPER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HostsBlockTests(unittest.TestCase):
    def test_removes_only_managed_block(self):
        contents = (
            f"{module.BEGIN}\n"
            "127.0.0.1 example.com\n"
            f"{module.END}\n"
            "127.0.0.1 localhost\n"
            "1.2.3.4 user.example\n"
        )
        self.assertEqual(
            module.without_managed_hosts(contents),
            "127.0.0.1 localhost\n1.2.3.4 user.example\n",
        )

    def test_preserves_original_trailing_newlines(self):
        original = "127.0.0.1 localhost\n\n"
        managed = module.BEGIN + "\n127.0.0.1 example.com\n" + module.END + "\n" + original
        self.assertEqual(module.without_managed_hosts(managed), original)

    def test_rejects_incomplete_block(self):
        with self.assertRaises(RuntimeError):
            module.without_managed_hosts(f"127.0.0.1 localhost\n{module.BEGIN}\n")


class SupervisorTests(unittest.TestCase):
    def test_core_exit_reports_the_actual_log_error(self):
        with tempfile.TemporaryDirectory() as directory:
            log_path = pathlib.Path(directory) / "core.log"
            log_path.write_text("routing mode=rule\n2026/10/05 load routing rules: download failed\n")
            child = mock.Mock(returncode=1)
            child.poll.return_value = 1
            with self.assertRaisesRegex(RuntimeError, "load routing rules: download failed"):
                module.wait_for_port(53, child, str(log_path))

    def test_dns_only_does_not_change_proxy(self):
        def command(*args):
            if args[1] == "-listallnetworkservices":
                return "An asterisk means disabled\nWi-Fi"
            if args[1] == "-getdnsservers":
                return "1.1.1.1"
            return ""

        with mock.patch.object(module, "run", side_effect=command) as run:
            snapshot = module.network_snapshot(False, True)
            module.apply_network(snapshot, "127.0.0.1", None, False, True)
            module.restore_network(snapshot)
        self.assertEqual(snapshot, {"Wi-Fi": {"dns": ["1.1.1.1"]}})
        commands = [call.args[1] for call in run.call_args_list]
        self.assertNotIn("-getwebproxy", commands)
        self.assertNotIn("-setwebproxy", commands)
        self.assertEqual(commands.count("-setdnsservers"), 2)

    def test_proxy_only_does_not_change_dns(self):
        snapshot = {"Wi-Fi": {
            "webproxy": {"server": "", "port": "0", "enabled": False},
            "securewebproxy": {"server": "", "port": "0", "enabled": False},
        }}
        with mock.patch.object(module, "run") as run:
            module.apply_network(snapshot, "127.0.0.1", 8080, True, False)
            module.restore_network(snapshot)
        commands = [call.args[1] for call in run.call_args_list]
        self.assertNotIn("-setdnsservers", commands)
        self.assertIn("-setwebproxy", commands)
        self.assertEqual(
            [call.args[3] for call in run.call_args_list if call.args[1] == "-setwebproxystate"],
            ["on", "off"],
        )
        self.assertEqual(
            [call.args[3] for call in run.call_args_list if call.args[1] == "-setsecurewebproxystate"],
            ["on", "off"],
        )

    def test_restores_network_and_hosts_after_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            base = pathlib.Path(directory)
            stop = base / "stop"
            stop.write_text("stop")
            request = {
                "logPath": str(base / "log"),
                "statusPath": str(base / "status"),
                "stopPath": str(stop),
                "coreBinary": "/mock/core",
                "configPath": "/mock/config",
                "coreDirectory": directory,
                "checkPorts": [53],
                "proxy": True,
                "dns": True,
                "proxyPort": 8080,
                "hosts": True,
                "hostsDomains": ["example.com"],
                "appPid": 123,
            }
            child = mock.Mock(pid=456, returncode=None)
            child.poll.return_value = None
            snapshot = {"Wi-Fi": {"dns": []}}
            with (
                mock.patch.object(module.subprocess, "Popen", return_value=child),
                mock.patch.object(module, "wait_for_port"),
                mock.patch.object(module, "network_snapshot", return_value=snapshot) as network_snapshot,
                mock.patch.object(module, "apply_network") as apply_network,
                mock.patch.object(module, "restore_network") as restore_network,
                mock.patch.object(module, "update_hosts") as update_hosts,
                mock.patch.object(module.time, "sleep"),
            ):
                module.supervise(request)
            network_snapshot.assert_called_once_with(True, True)
            apply_network.assert_called_once_with(snapshot, "127.0.0.1", 8080, True, True)
            restore_network.assert_called_once_with(snapshot)
            self.assertEqual(update_hosts.call_args_list, [mock.call(["example.com"]), mock.call([])])
            child.send_signal.assert_called_once()
            self.assertIn('"ready"', (base / "status").read_text())

    def test_restores_network_after_partial_apply_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            base = pathlib.Path(directory)
            request = {
                "logPath": str(base / "log"),
                "statusPath": str(base / "status"),
                "stopPath": str(base / "stop"),
                "coreBinary": "/mock/core",
                "configPath": "/mock/config",
                "coreDirectory": directory,
                "checkPorts": [53],
                "proxy": True,
                "dns": True,
                "proxyPort": 8080,
                "hosts": False,
                "hostsDomains": [],
                "appPid": 123,
            }
            child = mock.Mock(pid=456, returncode=None)
            child.poll.return_value = None
            snapshot = {"Wi-Fi": {"dns": []}}
            with (
                mock.patch.object(module.subprocess, "Popen", return_value=child),
                mock.patch.object(module, "wait_for_port"),
                mock.patch.object(module, "network_snapshot", return_value=snapshot),
                mock.patch.object(module, "apply_network", side_effect=RuntimeError("failed")),
                mock.patch.object(module, "restore_network") as restore_network,
                mock.patch.object(module.time, "sleep"),
            ):
                with self.assertRaisesRegex(RuntimeError, "failed"):
                    module.supervise(request)
            restore_network.assert_called_once_with(snapshot)
            child.send_signal.assert_called_once()
            self.assertIn('"error"', (base / "status").read_text())


if __name__ == "__main__":
    unittest.main()
