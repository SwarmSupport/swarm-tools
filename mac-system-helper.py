"""Privileged macOS supervisor for the optional system integration switches."""

import json
import os
import re
import signal
import socket
import subprocess
import sys
import time

HOSTS_PATH = "/etc/hosts"
NETWORKSETUP = "/usr/sbin/networksetup"
BEGIN = "# BEGIN SWARM TOOLS MANAGED HOSTS"
END = "# END SWARM TOOLS MANAGED HOSTS"
stop_requested = False


def on_stop(_signal, _frame):
    global stop_requested
    stop_requested = True


def run(*args):
    result = subprocess.run(args, text=True, capture_output=True, check=False, timeout=15)
    if result.returncode:
        raise RuntimeError(f"{' '.join(args)}: {(result.stderr or result.stdout).strip()}")
    return result.stdout.strip()


def proxy_settings(service, kind):
    output = run(NETWORKSETUP, f"-get{kind}", service)
    values = dict(line.split(": ", 1) for line in output.splitlines() if ": " in line)
    if values.get("Authenticated Proxy Enabled", "0").lower() in ("1", "yes", "on"):
        raise RuntimeError(f"{service} has an authenticated {kind}; refusing to replace it")
    return {
        "server": values.get("Server", ""),
        "port": values.get("Port", "0"),
        "enabled": values.get("Enabled", "No").lower() in ("1", "yes", "on"),
    }


def network_snapshot(proxy, dns):
    lines = run(NETWORKSETUP, "-listallnetworkservices").splitlines()
    services = [line for line in lines[1:] if line and not line.startswith("*")]
    if not services:
        raise RuntimeError("No enabled macOS network service was found")
    snapshot = {}
    for service in services:
        settings = {}
        if proxy:
            pac_output = run(NETWORKSETUP, "-getautoproxyurl", service)
            if re.search(r"(?im)^Enabled:\s*(?:1|yes|on)\s*$", pac_output):
                raise RuntimeError(f"{service} uses automatic proxy configuration; disable it before enabling system proxy changes")
            settings["webproxy"] = proxy_settings(service, "webproxy")
            settings["securewebproxy"] = proxy_settings(service, "securewebproxy")
        if dns:
            dns_output = run(NETWORKSETUP, "-getdnsservers", service)
            settings["dns"] = [] if dns_output.startswith("There aren't any DNS Servers") else dns_output.splitlines()
        snapshot[service] = settings
    return snapshot


def set_proxy(service, kind, setting):
    server, port = setting["server"], setting["port"]
    if server:
        run(NETWORKSETUP, f"-set{kind}", service, server, str(port))
    else:
        try:
            run(NETWORKSETUP, f"-set{kind}", service, "", "0")
        except RuntimeError:
            pass  # Some macOS versions only allow disabling an empty proxy.
    run(NETWORKSETUP, f"-set{kind}state", service, "on" if setting["enabled"] else "off")


def restore_network(snapshot):
    failures = []
    for service, settings in snapshot.items():
        for kind in ("webproxy", "securewebproxy"):
            if kind in settings:
                try:
                    set_proxy(service, kind, settings[kind])
                except Exception as error:
                    failures.append(str(error))
        if "dns" in settings:
            try:
                run(NETWORKSETUP, "-setdnsservers", service, *(settings["dns"] or ["empty"]))
            except Exception as error:
                failures.append(str(error))
    if failures:
        raise RuntimeError("; ".join(failures))


def apply_network(snapshot, host, port, proxy, dns):
    for service in snapshot:
        if proxy:
            for kind in ("webproxy", "securewebproxy"):
                run(NETWORKSETUP, f"-set{kind}", service, host, str(port))
                run(NETWORKSETUP, f"-set{kind}state", service, "on")
        if dns:
            run(NETWORKSETUP, "-setdnsservers", service, "127.0.0.1")


def without_managed_hosts(contents):
    if BEGIN not in contents and END not in contents:
        return contents
    pattern = re.compile(rf"^{re.escape(BEGIN)}\n.*?^{re.escape(END)}\n", re.MULTILINE | re.DOTALL)
    matches = list(pattern.finditer(contents))
    if len(matches) != 1:
        raise RuntimeError("The managed hosts block is incomplete or duplicated")
    return pattern.sub("", contents, count=1)


def update_hosts(domains):
    with open(HOSTS_PATH, encoding="utf-8") as file:
        original = file.read()
    base = without_managed_hosts(original)
    if domains:
        block = "\n".join([BEGIN, *(f"127.0.0.1 {domain}" for domain in domains), END])
        updated = block + "\n" + base
    else:
        updated = base
    if updated != original:
        temporary = f"{HOSTS_PATH}.swarm-tools.tmp"
        try:
            with open(temporary, "w", encoding="utf-8") as file:
                file.write(updated)
            os.chmod(temporary, os.stat(HOSTS_PATH).st_mode & 0o777)
            os.replace(temporary, HOSTS_PATH)
            for command in (["/usr/bin/dscacheutil", "-flushcache"], ["/usr/bin/killall", "-HUP", "mDNSResponder"]):
                try:
                    subprocess.run(command, capture_output=True, timeout=5, check=False)
                except (OSError, subprocess.TimeoutExpired):
                    pass
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def write_status(path, **status):
    with open(path, "w", encoding="utf-8") as file:
        json.dump(status, file)
    os.chmod(path, 0o644)


def core_exit_error(child, log_path):
    message = f"st-core exited with code {child.returncode}"
    try:
        with open(log_path, encoding="utf-8") as file:
            lines = [line.strip() for line in file if line.strip()]
        if lines:
            return f"{message}: {lines[-1]}"
    except OSError:
        pass
    return message


def wait_for_port(port, child, log_path):
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise RuntimeError(core_exit_error(child, log_path))
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError(f"st-core did not listen on port {port}")


def supervise(request):
    global stop_requested
    log = open(request["logPath"], "a", encoding="utf-8", buffering=1)
    os.chmod(request["logPath"], 0o644)
    child = None
    snapshot = None
    hosts_applied = False
    try:
        child = subprocess.Popen(
            [request["coreBinary"], "-config", request["configPath"], "start", "all"],
            cwd=request["coreDirectory"], stdout=log, stderr=subprocess.STDOUT,
        )
        for port in request["checkPorts"]:
            wait_for_port(port, child, request["logPath"])
        time.sleep(0.5)
        if child.poll() is not None:
            raise RuntimeError(core_exit_error(child, request["logPath"]))
        if request["proxy"] or request["dns"]:
            snapshot = network_snapshot(request["proxy"], request["dns"])
            apply_network(snapshot, "127.0.0.1", request["proxyPort"], request["proxy"], request["dns"])
        if request["hosts"]:
            update_hosts(request["hostsDomains"])
            hosts_applied = True
        write_status(request["statusPath"], state="ready", pid=child.pid)
        while not stop_requested and child.poll() is None and alive(request["appPid"]) and not os.path.exists(request["stopPath"]):
            time.sleep(0.3)
        if child.poll() is not None and not stop_requested and alive(request["appPid"]) and not os.path.exists(request["stopPath"]):
            raise RuntimeError(core_exit_error(child, request["logPath"]))
    except Exception as error:
        log.write(f"System integration error: {error}\n")
        write_status(request["statusPath"], state="error", error=str(error))
        raise
    finally:
        cleanup_errors = []
        if hosts_applied:
            try:
                update_hosts([])
            except Exception as error:
                log.write(f"Could not restore hosts file: {error}\n")
                cleanup_errors.append(str(error))
        if snapshot:
            try:
                restore_network(snapshot)
            except Exception as error:
                log.write(f"Could not restore network settings: {error}\n")
                cleanup_errors.append(str(error))
        if child and child.poll() is None:
            child.send_signal(signal.SIGINT)
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                child.terminate()
                child.wait(timeout=4)
        log.close()
        if cleanup_errors:
            message = "Could not restore macOS settings: " + "; ".join(cleanup_errors)
            write_status(request["statusPath"], state="error", error=message)
            raise RuntimeError(message)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, on_stop)
    signal.signal(signal.SIGTERM, on_stop)
    with open(sys.argv[1], encoding="utf-8") as source:
        supervise(json.load(source))
