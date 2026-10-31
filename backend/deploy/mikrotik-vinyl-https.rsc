# Run only after the PC's vinyl-public-tls service is healthy on TCP 9444.
# Adds only dedicated VINYL rules. Existing CONNECT 80/443 rules remain in use.
:if ([:len [/ip firewall nat find where comment="VINYL API HTTPS"]] = 0) do={
    /ip firewall nat add chain=dstnat action=dst-nat protocol=tcp dst-address=149.54.58.86 dst-port=9444 to-addresses=10.30.5.10 to-ports=9444 comment="VINYL API HTTPS"
}
:if ([:len [/ip firewall filter find where comment="VINYL API HTTPS WAN"]] = 0) do={
    /ip firewall filter add chain=forward action=accept in-interface="ether1-Altyn Aay" connection-nat-state=dstnat protocol=tcp dst-address=10.30.5.10 dst-port=9444 comment="VINYL API HTTPS WAN" place-before=0
}
:if ([:len [/ip firewall nat find where comment="VINYL API HTTPS PC hairpin"]] = 0) do={
    /ip firewall nat add chain=srcnat action=src-nat src-address=10.30.5.8/30 dst-address=10.30.5.10 protocol=tcp dst-port=9444 out-interface=ether10-PC to-addresses=10.30.5.9 comment="VINYL API HTTPS PC hairpin" place-before=0
}
# Verify from a different internet connection:
# https://149.54.58.86:9444/api/health
# Rollback of only these new rules:
# /ip firewall nat remove [find where comment="VINYL API HTTPS"]
# /ip firewall nat remove [find where comment="VINYL API HTTPS PC hairpin"]
# /ip firewall filter remove [find where comment="VINYL API HTTPS WAN"]
