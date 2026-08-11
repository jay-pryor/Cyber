# ASD Samsung hardening guidelines vs. available tactical controls

Comparison of the settings recommended in the ASD *Security configuration guide: Samsung Galaxy
S10, S20 and Note 20 devices* against the tactical (Knox policy) controls this project can
actually set.

## Scope and method

| | |
|---|---|
| Source | `Reference Input Files/ASD Samsung Hardening Guidelines.mhtml` |
| Published by | Australian Signals Directorate / cyber.gov.au |
| Section compared | "Recommended device settings" (17 tables) |
| ASD settings extracted | **195** |
| Tactical controls available | **134** (from `policy-config-01042026_101449.json`) |

Settings were extracted from the guideline tables programmatically, keeping each table's
section heading so every row carries its Workspace / Non-Workspace attribution. The mapping to
tactical controls was generated as candidates by token matching and then **reviewed by hand** —
automated matches were rejected where the names collided but the meaning did not.

Both Workspace and Non-Workspace guidance is treated as applying, per the request. A setting
named in both sets of tables is marked **Both**.

> **This report maps capability, not compliance.** It says which recommendations the tool can
> express, not whether any device meets them. Nothing here has been checked against a device.

## The polarity trap — read before recording decisions

ASD phrases settings permissively (*Allow Camera*); the tactical register phrases them
restrictively (*Disable Camera*). **The two are inverted.** An ASD recommendation of
`Disallow` becomes a tactical value of `true` on the matching `Disable …` control:

| ASD says | Tactical control | Value to record |
|---|---|---|
| Allow Camera → `Disallow` | `policyList.Disable Camera` | `true` |
| Allow OTA Upgrade → `Allow` | `policyList.Disable OTA Updates` | `false` |

This affects **60** of the 83 mapped settings. The 20 that do **not** invert are:

- Allow Deactivate Device Admin
- Allow User to Stop System Signed Applications
- Block Wi-Fi Networks by SSID
- Device Lock Timeout (in Seconds)
- Enable Bluetooth Device Restrictions
- Enable OCSP Check
- Lock Timeout (in Seconds)
- Maximum Length of Numeric Sequences
- Maximum Number of Failed Attempt
- Maximum Number of Failed Attempts
- Minimum Passcode Length
- Minimum Wi-Fi Security Level
- Only Allow installation of Whitelisted Apps
- Passcode Content
- Prevent Installation of Blacklisted Apps
- Prevent New Admin Activation
- Prevent Un-installation of Required Apps
- Require SD Card Encryption
- Require Storage Encryption
- Set Common Criteria CC Mode

Everything else reads backwards from how ASD states it.

## Summary

| | Count | Of which have a tactical control |
|---|---|---|
| **Required** (a value is prescribed) | 116 | 61 |
| **Optional** ("Organisation decision") | 38 | 21 |
| **Site-specific** (configure, no fixed value) | 41 | 1 |
| **Total** | 195 | 83 |

- **83** settings map to a tactical control (65 exactly, 18 partially).
- **103** have no tactical control at all — of which **46 are Required**.
- **9** are better handled through the **Packages** register than a tactical toggle.
- **71** tactical controls have no counterpart anywhere in the guidelines.

---

## Part A — Required settings

ASD prescribes a specific value. 116 settings.

### Workspace

**Knox Workspace passcode**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Fingerprint Authentication | Workspace | Disallow | `policyList.Disable Fingerprint Authentication` |
| Multifactor Authentication | Workspace | Disable | — **none** |
| Minimum Passcode Length | Both | 14 | `passwordPolicy.minimumLength` |
| Maximum Number of Failed Attempts | Workspace | 5 | `passwordPolicy.maxAttemptsBeforeWipe` |
| Passcode Content | Both | Complex | `passwordPolicy.passwordQuality` |
| Maximum Passcode Age | Both | Less than 12 months | — **none** |
| Passcode History | Both | 8 | — **none** |
| Lock Timeout (in Seconds) | Workspace | Immediately on Device Lock 60 second timeout from inactivity | `lockscreenTimeoutSeconds` |
| Maximum Length of Numeric Sequences | Workspace | 5 | `passwordPolicy.maxNumSequence` |
| Minimum Number of Characters Changed | Workspace | 4 | — **none** |
| Password Visibility | Workspace | Disabled | — **none** |

**Knox Workspace Samsung Browser**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow Pop-Ups | Both | Disallow | — **none** |
| Allow Cookies | Both | Allow | — **none** |
| Allow Auto Fill | Workspace | Allow | — **none** |
| Allow JavaScript | Workspace | Allow | — **none** |
| Enable Show Security Warning | Workspace | Enable | — **none** |

**Knox Workspace Samsung Email**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Use SSL | Workspace | Enable | — **none** |
| Ignore SSL Errors | Workspace | Disable | — **none** |
| Use SSL | Workspace | Enable | — **none** |
| Ignore SSL Errors | Workspace | Disable | — **none** |

**Knox Workspace Exchange ActiveSync**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Use SSL | Workspace | Enable | — **none** |

**Knox Workspace application control**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Prevent Installation of Blacklisted Apps | Workspace | Enable, deny all | `policyList.Blacklist Installs By Package`<br>`policyList.Blacklist Installs By Signature` |
| Only Allow installation of Whitelisted Apps | Workspace | Enable | `appInstallWhitelist`<br>`appSignatureWhitelist` |
| Prevent Un-installation of Required Apps | Workspace | Enable | `policyList.Prevent Uninstalls` |

**Knox Workspace device restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow USB | Workspace | Disable | `policyList.Disable USB File Transfer`<br>`usbConnectionType`<br>_partial: no single "allow USB" control_ |
| Allow Display of Share Via List | Workspace | Disable | `policyList.Disable Share List` |
| Force Secure Keypad Usage | Workspace | Enable | — **none** |
| Allow Contact Info Outside the Container | Workspace | Disable | — **none** |
| Allow Account Addition | Workspace | Disable | — **none** |
| Allow Google Account Activation | Workspace | Disable | — **none** |
| Allow Screen Capture | Both | Disable | `policyList.Disable Screen Capture` |
| Allow Mock Locations | Both | Disable | `policyList.Disable Mock Location` |
| Allow Bluetooth | Both | Disable | `policyList.Disable Bluetooth` |
| Enforce Container Keyguard | Workspace | Enable | — **none** |
| Prevent New Admin Activation | Workspace | Enable | `policyList.Prevent New Admin Activation`<br>_same name, no polarity flip_ |
| Set Common Criteria CC Mode | Workspace | Enable | `policyList.Enable CC Mode` |
| Enable Application Move | Workspace | Disable | — **none** |
| Enable File Move | Workspace | Disable | — **none** |
| Allow Google Crash Report | Both | Disable | `policyList.Disable Google Crash Report` |
| Allow S Voice (Bixby) | Both | Disable | — _use the **Packages** register (the Bixby package set)_ |
| Allow User to Stop System Signed Applications | Both | Disable | `policyList.Prevent Uninstalls`<br>_partial: closest available_ |
| Allow Google Mobile Services (GMS) Applications in Container | Workspace | Disable | — _use the **Packages** register (the GMS package set)_ |
| Allow Google Accounts Auto Sync | Workspace | Disable | `policyList.Disable Google Auto Sync` |
| Allow Change Data Sync Policy | Workspace | Disable | — **none** |
| Allow SD Card Move | Both | Disable | `policyList.Disable SD Card`<br>_partial: one coarse control covers access/write/move_ |
| Allow Settings Change | Workspace | Disable | — **none** |
| Allow Reset Container on Reboot | Workspace | Disable | — **none** |

### Non-Workspace

**Non-Workspace (device wide) VPN**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Client Type | Non-Workspace | Native Samsung Internet Protocol Security (IPsec) Client (com.samsung.sVpn) | — **none** |
| Enforce Service Validation | Non-Workspace | Enable | — **none** |
| Connection Type | Non-Workspace | StrongSwan Certificates | — **none** |
| Split Tunnel Type | Non-Workspace | Disallow | — **none** |
| Authentication Type | Non-Workspace | Certificate-based should be selected. | — **none** |

**Non-Workspace passcode**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Minimum Passcode Length | Both | 14 | `passwordPolicy.minimumLength` |
| Passcode Content | Both | Complex | `passwordPolicy.passwordQuality` |
| Maximum Number of Failed Attempt | Non-Workspace | 5 | `passwordPolicy.maxAttemptsBeforeWipe` |
| Maximum Passcode Age | Both | Less than 12 months | — **none** |
| Passcode History | Both | 5 | — **none** |
| Device Lock Timeout (in Seconds) | Non-Workspace | Immediately on Device Lock 60 second timeout from inactivity | `lockscreenTimeoutSeconds` |
| Enable Passcode Visibility | Non-Workspace | Disable | — **none** |
| Allow Fingerprint Unlock | Non-Workspace | Disallow | `policyList.Disable Fingerprint Authentication` |
| Require Storage Encryption | Non-Workspace | Require | `policyList.Require SDCard Encryption`<br>_partial: only SD-card encryption is exposed; internal storage is not_ |
| Require SD Card Encryption | Non-Workspace | Require | `policyList.Require SDCard Encryption` |

**Non-Workspace device restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow Factory Reset | Non-Workspace | Disallow | `policyList.Disable Factory Reset` |
| Allow Mock Locations | Both | Disallow | `policyList.Disable Mock Location` |
| Allow USB Media Player | Non-Workspace | Disallow | — _use the **Packages** register (the media-player package)_ |
| Allow NFC | Non-Workspace | Disallow | `policyList.Disable NFC` |
| Allow NFC State Change | Non-Workspace | Disallow | `policyList.Disable NFC`<br>_partial: no separate state-change control_ |
| Allow User to Set Background Process Limit | Non-Workspace | Disallow | — **none** |
| Allow Fingerprint Authentication | Non-Workspace | Disallow | `policyList.Disable Fingerprint Authentication` |
| Allow Deactivate Device Admin | Non-Workspace | Disallow | `policyList.Prevent New Admin Activation`<br>_partial: controls activation, not deactivation_ |

**Non-Workspace sync and storage restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow USB Debugging | Non-Workspace | Disallow | `policyList.Disable USB Debugging` |
| Allow USB Mass Storage | Non-Workspace | Disallow | `policyList.Disable USB File Transfer`<br>`usbConnectionType`<br>_partial: MTP/mass-storage split differs from the ASD wording - confirm on device_ |
| Allow Google Backup | Non-Workspace | Disallow | `policyList.Disable Google Backup` |
| Allow Google Account Auto Sync | Non-Workspace | Disallow | `policyList.Disable Google Auto Sync` |
| Allow SD Card Access | Non-Workspace | Disallow | `policyList.Disable SD Card`<br>_partial: one coarse control covers access/write/move_ |
| Allow OTA Upgrade | Non-Workspace | Allow | `policyList.Disable OTA Updates` |
| Allow SD Card Write | Non-Workspace | Disallow | `policyList.Disable SD Card`<br>_partial: one coarse control covers access/write/move_ |
| Allow USB Host Storage | Non-Workspace | Disallow | `policyList.Disable USB Host Storage`<br>`usbHostWhitelist` |
| Allow SD Card Move | Both | Disallow | `policyList.Disable SD Card`<br>_partial: one coarse control covers access/write/move_ |

**Non-Workspace application restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow Google Play | Non-Workspace | Disallow | — _use the **Packages** register (com.android.vending)_ |
| Allow YouTube | Non-Workspace | Disallow | — _use the **Packages** register (com.google.android.youtube)_ |
| Allow Access to Device Settings | Non-Workspace | Allow | `policyList.Disable Settings` |
| Allow Developer Options | Non-Workspace | Disallow | `policyList.Disable Developer Mode` |
| Allow Non-Market App Installation | Non-Workspace | Disallow | `policyList.Disallow Non-Market Apps` |
| Allow Google Crash Report | Both | Disallow | `policyList.Disable Google Crash Report` |
| Allow Android Beam | Non-Workspace | Disallow | — _use the **Packages** register (the Beam/NFC-share packages)_ |
| Allow S Beam | Non-Workspace | Disallow | — _use the **Packages** register (the Beam/NFC-share packages)_ |
| Allow S Voice (Bixby) | Both | Disallow | — _use the **Packages** register (the Bixby package set)_ |
| Allow User to Stop System Signed Applications | Both | Disallow | `policyList.Prevent Uninstalls`<br>_partial: closest available_ |

**Non-Workspace Bluetooth restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Enable Bluetooth Device Restrictions | Non-Workspace | If Bluetooth enabled - Allow | `policyList.Activate Bluetooth Device Restriction`<br>`bluetoothDevicesWhitelist` |
| Enable Bluetooth Secure Mode | Non-Workspace | Allow | — **none** |

**Non-Workspace tethering restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow All Tethering | Non-Workspace | Disallow | `policyList.Disable Wifi Tethering`<br>`policyList.Disable Bluetooth Tethering`<br>`policyList.Disable USB Tethering`<br>_partial: no single "all tethering" control - set all three_ |
| Allow Wi-Fi Tethering | Non-Workspace | Disallow | `policyList.Disable Wifi Tethering` |
| Allow Bluetooth Tethering | Non-Workspace | Disallow | `policyList.Disable Bluetooth Tethering` |
| Allow USB Tethering | Non-Workspace | Disallow | `policyList.Disable USB Tethering` |

**Non-Workspace browser restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow Native Android Browser | Non-Workspace | Allow | — _use the **Packages** register (the browser package)_ |
| Allow Pop-Ups | Both | Disallow | — **none** |
| Allow Cookies | Both | Allow | — **none** |
| Enable Autofill for Android | Non-Workspace | Allow | — **none** |
| Enable JavaScript For Android | Non-Workspace | Allow | — **none** |
| Force fraud warning | Non-Workspace | Enable | — **none** |

**Non-Workspace security restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow Activation Lock | Non-Workspace | Allow | — **none** |
| Allow Firmware Recovery | Non-Workspace | Disallow | `policyList.Disable Firmware Recovery` |
| Allow User Creation (Requires Allow Multiple Users to be enabled) | Non-Workspace | Disallow | `policyList.Disable Multiple User Mode`<br>_partial: covered only by disabling multi-user entirely_ |
| Allow User Removal (Requires Allow Multiple Users to be enabled) | Non-Workspace | Disallow | `policyList.Disable Multiple User Mode`<br>_partial: covered only by disabling multi-user entirely_ |
| Allow Multiple User | Non-Workspace | Disallow | `policyList.Disable Multiple User Mode` |
| Allow Keyguard | Non-Workspace | Allow | — **none** |
| Allow Trusted Agent | Non-Workspace | Disallow | `policyList.Disable Smart Lock`<br>_partial: Smart Lock is the trusted-agent mechanism_ |
| Allow Fingerprint on Keyguard Screen | Non-Workspace | Disallow | `policyList.Disable Fingerprint Authentication`<br>_partial: tactical control is device-wide, not keyguard-specific_ |
| Allow Un-redacted Notifications on Keyguard Screen | Non-Workspace | Disallow | `policyList.Disable Unredacted Notifications` |
| Allow Fingerprint Unlock | Non-Workspace | Disallow | `policyList.Disable Fingerprint Authentication` |

**Non-Workspace network restrictions**

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow Wi-Fi Profiles | Non-Workspace | Allow | — **none** |
| Allow Prompt for Credentials | Non-Workspace | Allow | — **none** |
| Allow Only Secure VPN Connections | Non-Workspace | Allow | — **none** |
| Allow Native VPN | Non-Workspace | Allow | — **none** |
| Allow Wi-Fi Direct | Non-Workspace | Disallow | `policyList.Disable Wifi Direct` |

---

## Part B — Optional settings ("Organisation decision")

ASD explicitly leaves these to the organisation. 38 settings. Each still needs a recorded
decision and rationale — "Organisation decision" is a requirement to decide, not permission to
skip.

### Workspace

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Forbidden Strings | Workspace | Organisation decision (Recommended list of common passwords and passcodes) | — **none** |
| Enable SmartCard Authentication | Workspace | Organisation decision | — **none** |
| Allow Camera | Both | Organisation decision | `policyList.Disable Camera` |
| Allow Video Recording if Camera is Allowed | Workspace | Organisation decision | `policyList.Disable Video Record` |
| Allow Microphone | Both | Organisation decision | `policyList.Disable Microphone` |
| Allow Audio Recording if Microphone is Allowed | Both | Organisation decision | `policyList.Disable Audio Record` |
| Enable Allow Clipboard | Workspace | Organisation decision | `policyList.Disable Clipboard` |

### Non-Workspace

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Allow Camera | Both | Organisation decision | `policyList.Disable Camera` |
| Allow Microphone | Both | Organisation decision | `policyList.Disable Microphone` |
| Allow Screen Capture | Both | Organisation decision | `policyList.Disable Screen Capture` |
| Allow Clipboard | Non-Workspace | Organisation decision | `policyList.Disable Clipboard` |
| Allow Email Account Addition | Non-Workspace | Organisation decision | — **none** |
| Allow Email Account Removal | Non-Workspace | Organisation decision | — **none** |
| Allow Google Account Addition | Non-Workspace | Organisation decision | — **none** |
| Allow POP / IMAP Email | Non-Workspace | Organisation decision | — **none** |
| Allow Notifications | Non-Workspace | Organisation decision | — **none** |
| Allow Audio Recording if Microphone is Allowed | Both | Organisation decision | `policyList.Disable Audio Record` |
| Allow Video Recording of Camera is Allowed | Non-Workspace | Organisation decision | `policyList.Disable Video Record` |
| Allow Ending Activity When Left Idle | Non-Workspace | Organisation decision | — **none** |
| Allow Headphones | Non-Workspace | Organisation decision | — **none** |
| Allow All Local Services | Non-Workspace | Organisation decision | — **none** |
| Allow Copy & Paste Between Applications | Non-Workspace | Organisation decision | `policyList.Disable Clipboard Sharing` |
| Allow Bluetooth | Both | Organisation decision | `policyList.Disable Bluetooth` |
| Allow Bluetooth Pairing | Non-Workspace | Organisation decision | `policyList.Disable Bluetooth Pairing` |
| Allow GPS Location Services | Non-Workspace | Organisation decision | — **none** |
| Allow Wireless Network Location Services | Non-Workspace | Organisation decision | — **none** |
| Allow Passive Location Services | Non-Workspace | Organisation decision | — **none** |
| Allow Lock Screen Settings | Non-Workspace | Organisation decision | — **none** |
| Allow Camera on Keyguard Screen | Non-Workspace | Organisation decision | `policyList.Disable Secure Camera`<br>_partial: closest available control_ |
| Allow Notifications on Keyguard Screen | Non-Workspace | Organisation decision, as long as redacted only. | `policyList.Disable Secure Notifications`<br>_partial: closest available_ |
| Allow Wi-Fi | Non-Workspace | Organisation decision | `policyList.Disable Wifi` |
| Allow Cellular Data | Non-Workspace | Organisation decision | `policyList.Disable Mobile Data Usage` |
| Allow Wi-Fi Changes | Non-Workspace | Organisation decision | — **none** |
| Allow Unsecure Wi-Fi | Non-Workspace | Organisation decision | `policyList.Disable Unsecure Connections` |
| Allow Auto Connection Wi-Fi | Non-Workspace | Organisation decision | — **none** |
| Minimum Wi-Fi Security Level | Non-Workspace | Organisation decision | `policyList.Set Min Wifi Security - WPA`<br>`policyList.Set Min Wifi Security - WEP`<br>`policyList.Set Min Wifi Security - PEAP`<br>`policyList.Set Min Wifi Security - EAPTLS`<br>`policyList.Set Min Wifi Security - EAPPWD`<br>_five separate minimum-security controls rather than one level_ |
| Block Wi-Fi Networks by SSID | Non-Workspace | Organisation decision | `policyList.Activate Wifi SSID Restriction`<br>`wifiSsidsWhitelist` |
| Set Global HTTP Proxy | Non-Workspace | Organisation decision | — **none** |

---

## Part C — Site-specific configuration

These are configuration steps whose value depends on your environment (server names,
certificates, credentials). ASD prescribes that they be configured, not what to. 41 settings,
almost entirely VPN, email and Exchange profile settings — none of which are tactical policy.

### Workspace

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Protocol | Workspace | Set which server the email client uses to receive and send emails. | — **none** |
| Username | Both | Define the Username for the authentication credentials using lookup values. | — **none** |
| Password | Both | Leave the Password blank to allow end-users to set their own password. | — **none** |
| Protocol | Workspace | Set which server the email client uses to receive and send emails. | — **none** |
| Username | Both | Define the Username for the authentication credentials using lookup values. | — **none** |
| Password | Both | Leave the Password blank to allow end-users to set their own password. | — **none** |
| Mail Client | Workspace | Select the native email client to be used on the device from the drop-down menu. | — **none** |
| Domain | Workspace | Use lookup values to define the domain for authentication credentials. | — **none** |
| User | Workspace | Use lookup values to define the user for authentication credentials. | — **none** |
| Email Address | Workspace | Use lookup values to define the email address for authentication credentials. | — **none** |
| Password | Both | Leave this text box blank to allow end-users to create their own password. | — **none** |
| Path Prefix | Workspace | Enter your path prefix. | — **none** |
| Identity Certificate | Both | Select an Identity Certificate from the drop-down, if you require the end-user to pass a certificate to connect to the Exchange ActiveSync. | — **none** |
| Retrieval Size | Workspace | Indicate the maximum email size that is automatically delivered to your device without having to download the message. | — **none** |
| Period Calendar | Workspace | Select frequency from the drop-down menu. | — **none** |
| Accept Certificates | Workspace | Enable to allow certificates for email authentication. | — **none** |
| Enable HTML Email | Workspace | Enable to allow HTML formatted emails. | — **none** |
| Default Account | Workspace | Assign the EAS account as the default for sending email messages. | — **none** |
| Enable OCSP Check | Workspace | Turn on to allow use of Online Certificate Status Protocol during certificate revocation for application SSL connections. | `policyList.Enforce OCSP Checking` |

### Non-Workspace

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Server Suffix | Non-Workspace | Designate the domain to which the authenticating server must belong. | — **none** |
| User Authentication | Non-Workspace | Enable this text box to require user credentials for VPN access. The selected Client Type determines applicable text boxes displayed in this section. The following text boxes display upon selection: ‘Username - Enter the username users are required to enter at setup'. ‘Password - Leave blank to allow Users to input their password'. | — **none** |
| Identity Certificate | Both | Use the drop-down to select the credentials for authenticating the connection. | — **none** |
| Root Certificate | Non-Workspace | Specify the trust certificate authority. | — **none** |
| Enable Advanced Configurations | Non-Workspace | Select the check box to display more options to configurable your VPN profile based on the selected client type. | — **none** |
| Backup Server Name | Non-Workspace | Enter the name of the server to connect to if the primary VPN gateway fails. | — **none** |
| Default Route Enabled | Non-Workspace | Enable to ensure that all network traffic goes through the tunnel. | — **none** |
| IKE Version | Non-Workspace | Internet Key Exchange (IKE) protocol version for setting up security association. Ensure either ‘IPsec Xauth RSA' or ‘IPsec IKEv2 RSA' are selected. | — **none** |
| Dead Peer Detection | Non-Workspace | Enable dead peer detection to allow the KeyVPN client to detect a dead IKE peer. | — **none** |
| PFS Exchange | Non-Workspace | To be enabled if the session key should be protected. | — **none** |
| Suite B | Non-Workspace | Use Suite B cryptography for connecting to VPN for higher security. | — **none** |
| Phase 1 Mode | Non-Workspace | Sets up a secure tunnel to authenticate and secure the IKE tunnel. If the MDM presents the option for ‘Aggressive Mode' for IKEV1 this should be disabled. | — **none** |
| DH Group | Non-Workspace | Sets the key strength used in phase 1 during key exchange. The higher the group number, the more secure the key exchange. Organisations should implement at minimum group 14. Organisations should refer to the ISM to ensure implementation of approved cryptography. | — **none** |
| Forward Routes | Non-Workspace | Enter an alternate destination for the split tunnel to be directed. This text box is only displayed if ‘Split Tunnel Type' is set to ‘Manual'. | — **none** |
| Proxy Type | Non-Workspace | Select whether the proxy connects by Static Proxy or Proxy Auto Configuration. | — **none** |
| Server | Non-Workspace | Enter the Host name or IP address for the proxy server. | — **none** |
| Port | Non-Workspace | Specify the target port for the proxy server. | — **none** |
| Username | Both | Enter user credentials. | — **none** |
| Password | Both | Enter user credentials. | — **none** |
| Assignment (For consideration in Container VPN implementation) | Non-Workspace | Select the assignment level as All Container Applications or Individual Applications. For Individual Applications, enter the application package name (app identifier) for the Applications you want to have Application level VPN. Examples include: ‘Container application - sec_container_1.airwatchEmailClient'. ‘Application outside the container - com.airwatch.androidagent'. | — **none** |
| Enable Debug Logging | Non-Workspace | Include more detailed information in the diagnostics reports for troubleshooting. | — **none** |
| Show Warnings | Non-Workspace | Show message in case of connectivity problems or when server name cannot be resolved. | — **none** |

---

## Part D — Settings recommended in both Workspace and Non-Workspace guidance

19 settings appear in both sets of tables.

**11 of them are recommended differently depending on scope** — worth care, because a single
tactical control often cannot express both at once:

| Setting | Workspace | Non-Workspace |
|---|---|---|
| Allow Bluetooth | Disable | Organisation decision |
| Allow Google Crash Report | Disable | Disallow |
| Allow Mock Locations | Disable | Disallow |
| Allow S Voice (Bixby) | Disable | Disallow |
| Allow SD Card Move | Disable | Disallow |
| Allow Screen Capture | Disable | Organisation decision |
| Allow User to Stop System Signed Applications | Disable | Disallow |
| Identity Certificate | Select an Identity Certificate from the drop-down, if you require the end-user to pass a certificate to connect to the Exchange ActiveSync. | Use the drop-down to select the credentials for authenticating the connection. |
| Passcode History | 8 | 5 |
| Password | Leave this text box blank to allow end-users to create their own password. | Enter user credentials. |
| Username | Define the Username for the authentication credentials using lookup values. | Enter user credentials. |

---

## Part E — Required settings with no tactical control

The coverage gap that matters: ASD prescribes a value and the tactical register cannot set it.

| Setting | Applies to | ASD recommendation | Tactical control |
|---|---|---|---|
| Multifactor Authentication | Workspace | Disable | — **none** |
| Maximum Passcode Age | Both | Less than 12 months | — **none** |
| Passcode History | Both | 8 | — **none** |
| Minimum Number of Characters Changed | Workspace | 4 | — **none** |
| Password Visibility | Workspace | Disabled | — **none** |
| Allow Pop-Ups | Both | Disallow | — **none** |
| Allow Cookies | Both | Allow | — **none** |
| Allow Auto Fill | Workspace | Allow | — **none** |
| Allow JavaScript | Workspace | Allow | — **none** |
| Enable Show Security Warning | Workspace | Enable | — **none** |
| Use SSL | Workspace | Enable | — **none** |
| Ignore SSL Errors | Workspace | Disable | — **none** |
| Use SSL | Workspace | Enable | — **none** |
| Ignore SSL Errors | Workspace | Disable | — **none** |
| Use SSL | Workspace | Enable | — **none** |
| Force Secure Keypad Usage | Workspace | Enable | — **none** |
| Allow Contact Info Outside the Container | Workspace | Disable | — **none** |
| Allow Account Addition | Workspace | Disable | — **none** |
| Allow Google Account Activation | Workspace | Disable | — **none** |
| Enforce Container Keyguard | Workspace | Enable | — **none** |
| Enable Application Move | Workspace | Disable | — **none** |
| Enable File Move | Workspace | Disable | — **none** |
| Allow Change Data Sync Policy | Workspace | Disable | — **none** |
| Allow Settings Change | Workspace | Disable | — **none** |
| Allow Reset Container on Reboot | Workspace | Disable | — **none** |
| Client Type | Non-Workspace | Native Samsung Internet Protocol Security (IPsec) Client (com.samsung.sVpn) | — **none** |
| Enforce Service Validation | Non-Workspace | Enable | — **none** |
| Connection Type | Non-Workspace | StrongSwan Certificates | — **none** |
| Split Tunnel Type | Non-Workspace | Disallow | — **none** |
| Authentication Type | Non-Workspace | Certificate-based should be selected. | — **none** |
| Maximum Passcode Age | Both | Less than 12 months | — **none** |
| Passcode History | Both | 5 | — **none** |
| Enable Passcode Visibility | Non-Workspace | Disable | — **none** |
| Allow User to Set Background Process Limit | Non-Workspace | Disallow | — **none** |
| Enable Bluetooth Secure Mode | Non-Workspace | Allow | — **none** |
| Allow Pop-Ups | Both | Disallow | — **none** |
| Allow Cookies | Both | Allow | — **none** |
| Enable Autofill for Android | Non-Workspace | Allow | — **none** |
| Enable JavaScript For Android | Non-Workspace | Allow | — **none** |
| Force fraud warning | Non-Workspace | Enable | — **none** |
| Allow Activation Lock | Non-Workspace | Allow | — **none** |
| Allow Keyguard | Non-Workspace | Allow | — **none** |
| Allow Wi-Fi Profiles | Non-Workspace | Allow | — **none** |
| Allow Prompt for Credentials | Non-Workspace | Allow | — **none** |
| Allow Only Secure VPN Connections | Non-Workspace | Allow | — **none** |
| Allow Native VPN | Non-Workspace | Allow | — **none** |

---

## Part F — Tactical controls with no ASD counterpart

71 controls the register exposes that the guidelines never mention. Not a gap — capability
beyond the baseline — but each still needs a decision and a rationale, and none of them can
cite this guide as its justification.

- `allowNightVisionAccess`
- `allowUserEditTime`
- `appAdminWhitelist`
- `auditLogRules.groups`
- `auditLogRules.outcome`
- `auditLogRules.severity`
- `batteryWhitelist`
- `disabledAppsList`
- `domainFilters`
- `enableGpsTime`
- `enableWarrantyBitNotification`
- `ethernetConfigs`
- `firewallRules`
- `imsSettings.simSlot0.enabled`
- `imsSettings.simSlot1.enabled`
- `nr5gModeStateSimSlot0`
- `nr5gModeStateSimSlot1`
- `passwordPolicy.maxCharSequence`
- `passwordPolicy.maxLockTime`
- `policyList.Auto Adjust Touch Sensitivity`
- `policyList.Disable 2G Connectivity`
- `policyList.Disable BLE Scanning`
- `policyList.Disable Bluetooth Data Transfer`
- `policyList.Disable Bluetooth Discovery`
- `policyList.Disable Dex Mode`
- `policyList.Disable ESIM`
- `policyList.Disable Ethernet Auto Config`
- `policyList.Disable Face Authentication`
- `policyList.Disable Firmware Auto Update`
- `policyList.Disable Hotspot 2.0`
- `policyList.Disable Incoming Calls`
- `policyList.Disable Incoming MMS`
- `policyList.Disable Incoming SMS`
- `policyList.Disable Open Wifi Hotspot`
- `policyList.Disable Outgoing Calls`
- `policyList.Disable Outgoing MMS`
- `policyList.Disable Outgoing SMS`
- `policyList.Disable POGO Keyboard Connection`
- `policyList.Disable Power Saving Mode`
- `policyList.Disable RCS`
- `policyList.Disable Safe Mode`
- `policyList.Disable WAP Push`
- `policyList.Disable Wallpaper Change`
- `policyList.Disable Wifi Scanning`
- `policyList.Disallow Airplane Mode`
- `policyList.Disallow User Add VPN`
- `policyList.Disallow User Change VPN`
- `policyList.Disallow User Set Always-On VPN`
- `policyList.Enable 24-Hour Clock`
- `policyList.Enable Audit Logging`
- `policyList.Enable Automatic Date Time`
- `policyList.Enable Boot Banner`
- `policyList.Enable Call Auto Pickup All`
- `policyList.Enable Call Auto Record`
- `policyList.Enable Firewall Rules`
- `policyList.Enable HardKey Broadcasts`
- `policyList.Enable Randomised Mac Address`
- `policyList.Enable Stealth Mode`
- `policyList.Enforce CRL Checking`
- `policyList.Enforce Dex Ethernet Only`
- `policyList.Exclude SDCard on Wipe`
- `policyList.Prevent Certificate Removal`
- `policyList.Prevent Edit Date Time`
- `policyList.Prevent GPS Setting Changes`
- `policyList.Prevent New Supported Accounts`
- `policyList.Set Emergency Call Only`
- `policyList.Turn Off Ethernet Auto Connect`
- `stealthHwControl`
- `usbDeviceAccessList`
- `usbSerialNumberAccessList`
- `wlan0Mtu`

---

## Caveats

1. **The guide targets S10 / S20 / Note 20.** Confirm applicability before relying on it for
   other models.
2. **Two Workspace subsections carry no settings table** — *Knox Workspace VPN* and *Knox
   Workspace credentials* are prose. Their guidance (use a device-wide VPN; store credentials
   in the TIMA Keystore) is not represented in the tables above.
3. **Partial mappings are not equivalences.** Where one coarse tactical control covers several
   ASD settings (SD card, tethering), setting it is broader than the recommendation.
4. **The tactical control list comes from one captured device.** A different firmware or Knox
   licence may expose more or fewer controls.
5. Duplicate rows in the source (Samsung Email lists its settings twice, for incoming and
   outgoing mail) are preserved as they appear in the guide.
