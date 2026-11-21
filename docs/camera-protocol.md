# Camera protocol

The camera acts as a Wi-Fi access point and runs an HTTP server at `192.168.1.254`.
This is the Novatek chipset protocol; the same commands are found on many action and dash cameras.

Everything below was observed on a FreeConn R3, firmware `R3V1.1_20240411`.

## Files

Recordings are served as plain files:

```
http://192.168.1.254/Novatek/Movie/20261120101500_000001.TS
```

File names start with the recording time, `YYYYMMDDHHMMSS`, followed by a sequence number.
The app groups clips by day from the name, so grouping does not depend on file metadata.

## Commands

```
http://192.168.1.254/?custom=1&cmd=<number>[&par=<number>][&str=<text>]
```

Replies are XML. `Status` is `0` when the camera accepted the command and negative otherwise.

```xml
<Function>
  <Cmd>3019</Cmd>
  <Status>0</Status>
  <Value>5</Value>
</Function>
```

| Command | Parameters | Purpose |
|---|---|---|
| 1001 | | Capture a photo (camera must be in photo mode) |
| 2001 | `par=1` / `par=0` | Start / stop recording |
| 2007 | `par=1` / `par=0` | Microphone on / off |
| 2008 | `par=1` / `par=0` | Date stamp on / off |
| 2016 | | Current recording time |
| 3001 | `par=0` / `par=1` | Switch to photo / video mode |
| 3005 | `str=YYYY-MM-DD` | Set the date |
| 3006 | `str=HH:MM:SS` | Set the time |
| 3010 | `par=1` | Format the SD card |
| 3012 | | Firmware version |
| 3014 | | All current settings |
| 3015 | | File list |
| 3017 | | Free space in bytes |
| 3019 | | Battery level |
| 4003 | `str=A:\Novatek\Movie\<file>` | Delete one file |
| 4004 | | Delete all files |

There is no pause command; stopping and starting creates a new clip.

## File list

Command 3015 returns one `File` element per recording:

```xml
<File>
  <NAME>20261120101500_000001.TS</NAME>
  <FPATH>A:\Novatek\Movie\20261120101500_000001.TS</FPATH>
  <SIZE>52428800</SIZE>
  <TIME>2026/11/20 10:15:00</TIME>
</File>
```

If the command returns nothing usable, the client falls back to parsing the HTML index of
`/Novatek/Movie`.

## Connection detection

iOS does not let an app read the Wi-Fi network name without special entitlements, so the app
detects the camera by calling command 3012 with a two second timeout.

## Bluetooth

The R3 pairs as a classic Bluetooth headset for audio only. It does not advertise a Bluetooth LE
service, so files and commands are available over Wi-Fi only.

## Implementation

[`src/camera/client.ts`](../src/camera/client.ts) contains the whole client. Its parsers are covered
by [`tests/client.test.ts`](../tests/client.test.ts).
