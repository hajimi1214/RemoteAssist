"""Generate a short-lived, IP-specific LAN test certificate without installing it."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import ipaddress
import json
import os
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
    # A new directory prevents silently replacing a CA already used by a test APK.
    directory.mkdir(parents=True, exist_ok=False, mode=0o700)
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
              .sign(ca_key, hashes.SHA256()))
    files = {
        "ca.cert.pem": ca.public_bytes(serialization.Encoding.PEM),
        "server.cert.pem": server.public_bytes(serialization.Encoding.PEM),
        "server.key.pem": server_key.private_bytes(serialization.Encoding.PEM,
                                                    serialization.PrivateFormat.PKCS8,
                                                    serialization.NoEncryption()),
    }
    for name, data in files.items():
        with (directory / name).open("xb") as output:
            output.write(data)
        if os.name != "nt":
            (directory / name).chmod(0o600 if "key" in name else 0o644)
    # The CA signing key is intentionally not saved; later tests generate a new CA.
    result = {
        "ip": str(address), "expiresAt": not_after.isoformat(),
        "caSha256": ca.fingerprint(hashes.SHA256()).hex(),
        "serverSha256": server.fingerprint(hashes.SHA256()).hex(),
    }
    (directory / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


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
