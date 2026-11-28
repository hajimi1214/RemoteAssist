"""Generate a short-lived, IP-specific LAN test certificate without installing it."""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta, timezone
import ipaddress
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def private_ipv4(value: str) -> ipaddress.IPv4Address:
    address = ipaddress.ip_address(value)
    networks = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]
    if not isinstance(address, ipaddress.IPv4Address) or not any(address in n for n in networks):
        raise ValueError("address must be an RFC1918 private IPv4 address")
    return address


def generate(address: ipaddress.IPv4Address, directory: Path, days: int) -> dict[str, str]:
    if not 1 <= days <= 7:
        raise ValueError("certificate lifetime must be between 1 and 7 days")
    # Never replace a CA that may already be trusted by a test client.
    if directory.exists():
        raise FileExistsError(directory)
    now = datetime.now(timezone.utc)
    not_before, not_after = now - timedelta(minutes=5), now + timedelta(days=days)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    server_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "RemoteAssist temporary LAN test CA")])
    ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
          .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
          .not_valid_before(not_before).not_valid_after(not_after)
          .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
          .add_extension(x509.KeyUsage(digital_signature=False, content_commitment=False,
                                      key_encipherment=False, data_encipherment=False,
                                      key_agreement=False, key_cert_sign=True, crl_sign=True,
                                      encipher_only=None, decipher_only=None), critical=True)
          .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
          .sign(ca_key, hashes.SHA256()))
    server_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, str(address))])
    server = (x509.CertificateBuilder().subject_name(server_name).issuer_name(ca.subject)
              .public_key(server_key.public_key()).serial_number(x509.random_serial_number())
              .not_valid_before(not_before).not_valid_after(not_after)
              .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
              .add_extension(x509.SubjectAlternativeName([x509.IPAddress(address)]), critical=False)
              .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
              .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                                          key_encipherment=True, data_encipherment=False,
                                          key_agreement=False, key_cert_sign=False, crl_sign=False,
                                          encipher_only=None, decipher_only=None), critical=True)
              .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
              .add_extension(x509.CRLDistributionPoints([
                  x509.DistributionPoint(
                      full_name=[x509.UniformResourceIdentifier(f"http://{address}:8090/lan-ca.crl")],
                      relative_name=None,
                      reasons=None,
                      crl_issuer=None,
                  )
              ]), critical=False)
              .sign(ca_key, hashes.SHA256()))
    crl = (x509.CertificateRevocationListBuilder().issuer_name(ca.subject)
           .last_update(not_before).next_update(not_after)
           .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
           .sign(ca_key, hashes.SHA256()))
    files = {
        "ca.cert.pem": ca.public_bytes(serialization.Encoding.PEM),
        "ca.cert.cer": ca.public_bytes(serialization.Encoding.DER),
        "lan-ca.crl": crl.public_bytes(serialization.Encoding.DER),
        "server.cert.pem": server.public_bytes(serialization.Encoding.PEM),
        "server.key.pem": server_key.private_bytes(serialization.Encoding.PEM,
                                                    serialization.PrivateFormat.PKCS8,
                                                    serialization.NoEncryption()),
    }
    result = {
        "ip": str(address), "expiresAt": not_after.isoformat(),
        "caSha256": ca.fingerprint(hashes.SHA256()).hex(),
        # SHA-1 here is only the legacy thumbprint format Windows certutil reports.
        "caThumbprintSha1": ca.fingerprint(hashes.SHA1()).hex().upper(),
        "serverSha256": server.fingerprint(hashes.SHA256()).hex(),
        "crlSha256": crl.fingerprint(hashes.SHA256()).hex(),
    }
    files["manifest.json"] = (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    directory.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{directory.name}.", dir=directory.parent))
    try:
        if os.name == "nt":
            _restrict_windows_directory(staging)
        else:
            staging.chmod(0o700)
        for name, data in files.items():
            with (staging / name).open("xb") as output:
                output.write(data)
            if os.name != "nt":
                (staging / name).chmod(0o600 if name == "server.key.pem" else 0o644)
        if os.name == "nt":
            _restrict_windows_file(staging / "server.key.pem")
        # Publishing the complete set with one same-volume rename prevents
        # clients from seeing a partially generated certificate directory.
        staging.rename(directory)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        raise
    return result


def _current_windows_user_sid() -> str:
    result = subprocess.run(
        ["whoami.exe", "/user", "/fo", "csv", "/nh"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    rows = list(csv.reader(result.stdout.splitlines()))
    if not rows or len(rows[0]) < 2 or not re.fullmatch(r"S-1(?:-\d+)+", rows[0][1]):
        raise RuntimeError("could not determine the current Windows user SID")
    return rows[0][1]


def _restrict_windows_directory(directory: Path) -> None:
    user_sid = _current_windows_user_sid()
    subprocess.run(
        [
            "icacls.exe", str(directory), "/inheritance:r", "/grant:r",
            f"*{user_sid}:(OI)(CI)(F)", "*S-1-5-18:(OI)(CI)(F)",
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def _restrict_windows_file(path: Path) -> None:
    user_sid = _current_windows_user_sid()
    subprocess.run(
        [
            "icacls.exe", str(path), "/inheritance:r", "/grant:r",
            f"*{user_sid}:(R)", "*S-1-5-18:(R)",
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ip", type=private_ipv4)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / ".local" / "lan-test")
    parser.add_argument("--days", type=int, default=2)
    args = parser.parse_args()
    try:
        result = generate(args.ip, args.out.resolve(), args.days)
    except (ValueError, FileExistsError) as error:
        parser.error(str(error))
    print(json.dumps({"status": "generated", "directory": str(args.out.resolve()), **result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
