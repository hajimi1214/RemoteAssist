import importlib.util
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.hashes import SHA1, SHA256
from cryptography.x509.oid import ExtendedKeyUsageOID

spec = importlib.util.spec_from_file_location("lan_cert", Path(__file__).with_name("new-lan-test-cert.py"))
lan_cert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lan_cert)


class LANCertificateTests(unittest.TestCase):
    def test_only_rfc1918_ipv4_is_accepted(self):
        for value in ["127.0.0.1", "0.0.0.0", "8.8.8.8", "169.254.1.1", "100.64.0.1", "::1"]:
            with self.assertRaises(ValueError):
                lan_cert.private_ipv4(value)
        self.assertEqual(str(lan_cert.private_ipv4("192.168.0.100")), "192.168.0.100")

    def test_chain_ip_scope_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as root:
            destination = Path(root) / "certs"
            ip = lan_cert.private_ipv4("192.168.0.100")
            lan_cert.generate(ip, destination, 2)
            ca = x509.load_pem_x509_certificate((destination / "ca.cert.pem").read_bytes())
            ca_der = x509.load_der_x509_certificate((destination / "ca.cert.cer").read_bytes())
            crl = x509.load_der_x509_crl((destination / "lan-ca.crl").read_bytes())
            server = x509.load_pem_x509_certificate((destination / "server.cert.pem").read_bytes())
            key = serialization.load_pem_private_key((destination / "server.key.pem").read_bytes(), password=None)
            manifest = json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(ca.public_bytes(serialization.Encoding.DER), ca_der.public_bytes(serialization.Encoding.DER))
            self.assertEqual(manifest["caSha256"], ca.fingerprint(SHA256()).hex())
            self.assertEqual(manifest["caSha256"], hashlib.sha256((destination / "ca.cert.cer").read_bytes()).hexdigest())
            self.assertEqual(manifest["caThumbprintSha1"], ca.fingerprint(SHA1()).hex().upper())
            self.assertEqual(manifest["crlSha256"], crl.fingerprint(SHA256()).hex())
            ca.public_key().verify(server.signature, server.tbs_certificate_bytes, padding.PKCS1v15(), server.signature_hash_algorithm)
            self.assertEqual(server.public_key().public_numbers(), key.public_key().public_numbers())
            self.assertTrue(ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca)
            self.assertFalse(server.extensions.get_extension_for_class(x509.BasicConstraints).value.ca)
            distribution_points = server.extensions.get_extension_for_class(x509.CRLDistributionPoints).value
            self.assertEqual(distribution_points[0].full_name[0].value, "http://192.168.0.100:8090/lan-ca.crl")
            self.assertEqual(crl.issuer, ca.subject)
            self.assertEqual(len(crl), 0)
            ca.public_key().verify(crl.signature, crl.tbs_certlist_bytes, padding.PKCS1v15(), crl.signature_hash_algorithm)
            with self.assertRaises(x509.ExtensionNotFound):
                ca.extensions.get_extension_for_class(x509.CRLDistributionPoints)
            self.assertEqual(server.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress), [ip])
            self.assertEqual(list(server.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value), [ExtendedKeyUsageOID.SERVER_AUTH])
            self.assertLessEqual((server.not_valid_after_utc-server.not_valid_before_utc).total_seconds(), 2*86400+300)
            self.assertFalse((destination / "ca.key.pem").exists())
            if os.name == "nt":
                directory_acl = lan_cert.subprocess.run(["icacls.exe", str(destination)], check=True, capture_output=True, text=True).stdout
                key_acl = lan_cert.subprocess.run(["icacls.exe", str(destination / "server.key.pem")], check=True, capture_output=True, text=True).stdout
                self.assertNotIn("(I)", directory_acl)
                self.assertNotIn("(I)", key_acl)
                self.assertIn("(R)", key_acl)
            with self.assertRaises(FileExistsError):
                lan_cert.generate(ip, destination, 2)

    def test_excessive_validity_is_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as root:
            destination = Path(root) / "certs"
            with self.assertRaises(ValueError):
                lan_cert.generate(lan_cert.private_ipv4("192.168.0.100"), destination, 30)
            self.assertFalse(destination.exists())

    def test_atomic_publish_removes_staging_directory_when_publish_fails(self):
        with tempfile.TemporaryDirectory() as root:
            parent = Path(root)
            destination = parent / "certs"
            with patch.object(lan_cert.Path, "rename", side_effect=OSError("simulated publish failure")):
                with self.assertRaises(OSError):
                    lan_cert.generate(lan_cert.private_ipv4("192.168.0.100"), destination, 2)
            self.assertFalse(destination.exists())
            self.assertEqual(list(parent.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
