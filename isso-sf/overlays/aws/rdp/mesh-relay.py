"""Start the vendor RDP mapping with a dedicated single-device MeshCentral account."""
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request

ORIGIN = "https://desktop.issosf.org/"
USERNAME = "rdp-relay@issosf.org"
DIGEST = "af81f6a7c7d1db57ccd569bda6f04de8678d9bfdc0df8ce7444fe016115b1275"
directory = Path("/run/relay")
os.umask(0o077)
password = Path("/run/credential/password").read_text()
node = "node//" + os.environ["MANDIR_NODE"]
http = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)
with http.open(ORIGIN, timeout=15):
    pass
form = urllib.parse.urlencode(
    {"action": "login", "username": USERNAME, "password": password}
).encode()
with http.open(ORIGIN, form, timeout=15):
    pass
params = urllib.parse.urlencode({"meshaction": "route", "nodeid": node})
with http.open(ORIGIN + "meshagents?" + params, timeout=15) as response:
    settings = json.load(response)
if (
    settings.get("remoteNodeId") != node
    or settings.get("remoteName", "").lower() != "issosanjose"
    or settings.get("serverUrl") not in (
        "wss://desktop.issosf.org:443/meshrelay.ashx",
        "wss://desktop.issosf.org/meshrelay.ashx",
    )
):
    raise RuntimeError("MeshCentral returned an unexpected route")
settings.update(username=USERNAME, password=password, localPort=3389,
                remotePort=3389, remoteTarget=None, debugLevel=0)
with http.open(ORIGIN + "meshagents?meshcmd=26", timeout=30) as response:
    binary = response.read(16 * 1024 * 1024)
if hashlib.sha256(binary).hexdigest() != DIGEST:
    raise RuntimeError("MeshCmd release fingerprint changed")
executable = directory / "meshcmd"
executable.write_bytes(binary)
executable.chmod(0o700)
config = directory / "meshaction.txt"
config.write_text(json.dumps(settings))
os.chdir(directory)
os.execv(executable, [str(executable), "--actionfile", str(config)])
