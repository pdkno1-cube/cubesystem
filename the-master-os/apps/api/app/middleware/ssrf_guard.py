"""SSRF (Server-Side Request Forgery) prevention utilities.

Security references:
  - P0-14: Block internal IP ranges in crawling / MCP endpoint URLs
  - A10 (OWASP): SSRF prevention
  - Security review section 11.5
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Private / reserved IPv4 networks
_BLOCKED_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local + cloud metadata
    ipaddress.ip_network("0.0.0.0/8"),
    # IPv6 equivalents
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

# Hostnames explicitly blocked (cloud metadata endpoints, etc.)
_BLOCKED_HOSTNAMES: frozenset[str] = frozenset({
    "localhost",
    "metadata.google.internal",
    "169.254.169.254",
    "metadata.internal",
    "[::1]",
})

# Allowed URL schemes
_ALLOWED_SCHEMES: frozenset[str] = frozenset({"http", "https"})


class SSRFViolation(Exception):
    """Raised when a URL is detected as an SSRF attempt."""


def _is_ip_blocked(ip_str: str) -> bool:
    """Check whether an IP address falls into a blocked network range."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False

    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
        return True

    for network in _BLOCKED_NETWORKS:
        if addr in network:
            return True

    return False


def validate_url(url: str, *, resolve_dns: bool = True) -> str:
    """Validate that *url* is safe from SSRF attacks.

    Parameters
    ----------
    url:
        The URL to validate.
    resolve_dns:
        When ``True``, resolve the hostname via DNS and verify the resolved
        IP is not in a blocked range.  Set to ``False`` in unit tests.

    Returns
    -------
    str
        The validated URL (unchanged).

    Raises
    ------
    SSRFViolation
        If the URL targets an internal/blocked resource.
    """
    parsed = urlparse(url)

    # 1. Scheme check
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise SSRFViolation(f"Disallowed URL scheme: {parsed.scheme}")

    # 2. Hostname presence
    hostname = parsed.hostname
    if not hostname:
        raise SSRFViolation("URL has no hostname")

    # 3. Explicit hostname blocklist
    if hostname.lower() in _BLOCKED_HOSTNAMES:
        raise SSRFViolation(f"Blocked hostname: {hostname}")

    # 4. Direct IP check (if hostname is an IP literal)
    if _is_ip_blocked(hostname):
        raise SSRFViolation(f"Blocked IP address: {hostname}")

    # 5. DNS resolution check
    if resolve_dns:
        try:
            resolved_ips = socket.getaddrinfo(hostname, None)
        except socket.gaierror:
            raise SSRFViolation(f"DNS resolution failed for: {hostname}")

        for family, _type, _proto, _canonname, sockaddr in resolved_ips:
            ip_str = sockaddr[0]
            if _is_ip_blocked(ip_str):
                logger.warning(
                    "SSRF blocked: hostname=%s resolved to blocked IP=%s",
                    hostname,
                    ip_str,
                )
                raise SSRFViolation(
                    f"Hostname {hostname} resolves to blocked IP: {ip_str}"
                )

    return url
